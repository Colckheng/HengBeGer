; HengBerGer 桌面安装器的 NSIS 脚本。
;
; 为什么不用 app-builder-lib 自带的 templates/nsis/installer.nsi：
; 官方流程会先用 BUILD_UNINSTALLER 定义编译一个「中间安装器」，再直接运行它，
; 让它自己 WriteUninstaller 吐出 uninstaller.exe 供 electron-builder 签名
; （app-builder-lib/out/targets/nsis/NsisTarget.js:337-381 computeScriptAndSignUninstaller）。
; 那一步在受限宿主里会被信号杀掉（exit code null / ERR_ELECTRON_BUILDER_CANNOT_EXECUTE），
; 整个打包就卡在这里，成品安装器（同文件 :301 executeMakensis）根本执行不到。
;
; 而 computeScriptAndSignUninstaller 的 :342-345 明确写着：
;   if (customScriptPath != null) {
;     log.info({reason:"custom NSIS script is used"}, "uninstaller is not signed by electron-builder");
;     return { script, isCustomScript: true };
;   }
; 一旦提供自定义 installer.nsi，整条 uninstaller 提取/签名流程被跳过，成品构建就能跑到。
; 代价是 uninstaller.exe 不被签名（我们没有代码签名证书，本来就签不了），
; 并且 :301 的 skipSizeVerification 会变成 true（体积校验跳过）。
;
; 本文件由官方模板改写而来（去掉了永远不会定义的 BUILD_UNINSTALLER 分支），
; 其余保持原样，避免和 electron-builder 追加的头部/尾部脚本失配。
; 升级 electron-builder 后请和 templates/nsis/installer.nsi 重新比对。

Var newStartMenuLink
Var oldStartMenuLink
Var newDesktopLink
Var oldDesktopLink
Var oldShortcutName
Var oldMenuDirectory

!include "common.nsh"
!include "MUI2.nsh"
!include "multiUser.nsh"
!include "allowOnlyOneInstallerInstance.nsh"

!ifdef INSTALL_MODE_PER_ALL_USERS
  RequestExecutionLevel admin
!else
  RequestExecutionLevel user
!endif

Var appExe
Var launchLink

!ifdef ONE_CLICK
  !include "oneClick.nsh"
!else
  !include "assistedInstaller.nsh"
!endif

!insertmacro addLangs

!ifmacrodef customHeader
  !insertmacro customHeader
!endif

Function .onInit
  Call setInstallSectionSpaceRequired

  SetOutPath $INSTDIR
  ${LogSet} on

  !ifmacrodef preInit
    !insertmacro preInit
  !endif

  !ifdef DISPLAY_LANG_SELECTOR
    !insertmacro MUI_LANGDLL_DISPLAY
  !endif

  !insertmacro check64BitAndSetRegView

  !ifdef ONE_CLICK
    !insertmacro ALLOW_ONLY_ONE_INSTALLER_INSTANCE
  !else
    ${IfNot} ${UAC_IsInnerInstance}
      !insertmacro ALLOW_ONLY_ONE_INSTALLER_INSTANCE
    ${EndIf}
  !endif

  !insertmacro initMultiUser

  !ifmacrodef customInit
    !insertmacro customInit
  !endif

  !ifmacrodef addLicenseFiles
    InitPluginsDir
    !insertmacro addLicenseFiles
  !endif
FunctionEnd

!include "installUtil.nsh"

; installSection.nsh 会调用 installApplicationFiles 宏，该宏定义在 include/installer.nsh，
; 末尾有一行：
;   File "/oname=${UNINSTALL_FILENAME}" "${UNINSTALLER_OUT_FILE}"
; 官方流程里 UNINSTALLER_OUT_FILE 由 NsisTarget.js:379 在编译出 uninstaller.exe 之后赋值；
; 我们走自定义脚本路线（NsisTarget.js:342-345 提前 return），这个 define 从未被赋值，
; 于是 makensis 收到 `File /oname=... ""`，报：
;   Usage: File [/nonfatal] [/a] ...
;   Error in macro installApplicationFiles on macroline 91
; NSIS 不允许重定义已存在的宏（!macro: macro named "installApplicationFiles" already exists!），
; 所以不能覆盖 installApplicationFiles；改为把 installSection.nsh 的内容内联进本文件，
; 只把那一行替换成等价的「解包 + 记录安装器位置」逻辑（官方宏的 !else 分支）。
!include "installer.nsh"

Section "install" INSTALL_SECTION_ID
  ; 静默升级按计算机安装时先提权，否则解包新版本会失败。
  ; 非静默安装的提权在界面里选安装模式时触发，静默时走不到。
  !ifndef INSTALL_MODE_PER_ALL_USERS
    !ifndef ONE_CLICK
      ${if} $hasPerMachineInstallation == "1" ; onInit 里由 initMultiUser 设置
      ${andIf} ${Silent}
        ${ifNot} ${UAC_IsAdmin}
          ShowWindow $HWNDPARENT ${SW_HIDE}
          !insertmacro UAC_RunElevated
          ${Switch} $0
            ${Case} 0
              ${Break}
            ${Case} 1223 ; 用户取消
              ${Break}
            ${Default}
              MessageBox mb_IconStop|mb_TopMost|mb_SetForeground "Unable to elevate, error $0"
              ${Break}
          ${EndSwitch}
          Quit
        ${else}
          !insertmacro setInstallModePerAllUsers
        ${endIf}
      ${endIf}
    !endif
  !endif
  ; ---- 以下内容来自 templates/nsis/installSection.nsh（官方文件，未改 node_modules）----
  ; 唯一改动：原 :66 `!insertmacro installApplicationFiles` 被替换为等价内联逻辑
  ; （见本文件 :105 的注释说明为何必须去掉 File uninstaller 那一行）。
  InitPluginsDir

  ${IfNot} ${Silent}
    SetDetailsPrint none
  ${endif}

  StrCpy $appExe "$INSTDIR\${APP_EXECUTABLE_FILENAME}"

  # must be called before uninstallOldVersion
  !insertmacro setLinkVars

  !ifdef ONE_CLICK
    !ifdef HEADER_ICO
      File /oname=$PLUGINSDIR\installerHeaderico.ico "${HEADER_ICO}"
    !endif
    ${IfNot} ${Silent}
      !ifdef HEADER_ICO
        SpiderBanner::Show /MODERN /ICON "$PLUGINSDIR\installerHeaderico.ico"
      !else
        SpiderBanner::Show /MODERN
      !endif

      FindWindow $0 "#32770" "" $hwndparent
      FindWindow $0 "#32770" "" $hwndparent $0
      GetDlgItem $0 $0 1000
      SendMessage $0 ${WM_SETTEXT} 0 "STR:$(installing)"

      StrCpy $1 $hwndparent
      System::Call 'user32::ShutdownBlockReasonCreate(${SYSTYPE_PTR}r1, w "$(installing)")'
    ${endif}
    !insertmacro CHECK_APP_RUNNING
  !else
    ${ifNot} ${UAC_IsInnerInstance}
      !insertmacro CHECK_APP_RUNNING
    ${endif}
  !endif

  Var /GLOBAL keepShortcuts
  StrCpy $keepShortcuts "false"
  !insertMacro setIsTryToKeepShortcuts
  ${if} $isTryToKeepShortcuts == "true"
    ReadRegStr $R1 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" KeepShortcuts

    ${if} $R1 == "true"
    ${andIf} ${FileExists} "$appExe"
      StrCpy $keepShortcuts "true"
    ${endIf}
  ${endif}

  !insertmacro uninstallOldVersion SHELL_CONTEXT
  !insertmacro handleUninstallResult SHELL_CONTEXT

  ${if} $installMode == "all"
    !insertmacro uninstallOldVersion HKEY_CURRENT_USER
    !insertmacro handleUninstallResult HKEY_CURRENT_USER
  ${endIf}

  SetOutPath $INSTDIR

  !ifdef UNINSTALLER_ICON
    File /oname=uninstallerIcon.ico "${UNINSTALLER_ICON}"
  !endif

  ; == 替换 installApplicationFiles 的开始 ==
  ; 官方宏（include/installer.nsh:9-101）在非 APP_BUILD_DIR / 非 APP_PACKAGE_URL 时的分支。
  !insertmacro extractEmbeddedAppPackage
  ; electron always uses per user app data
  ${if} $installMode == "all"
    SetShellVarContext current
  ${endif}
  !insertmacro copyFile "$EXEPATH" "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}"
  ${if} $installMode == "all"
    SetShellVarContext all
  ${endif}
  ; == 替换 installApplicationFiles 的结束 ==

  !insertmacro registryAddInstallInfo
  !insertmacro addStartMenuLink $keepShortcuts
  !insertmacro addDesktopLink $keepShortcuts

  ${if} ${FileExists} "$newStartMenuLink"
    StrCpy $launchLink "$newStartMenuLink"
  ${else}
    StrCpy $launchLink "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  ${endIf}

  !ifmacrodef registerFileAssociations
    !insertmacro registerFileAssociations
  !endif

  !ifmacrodef customInstall
    !insertmacro customInstall
  !endif

  !macro doStartApp
    # otherwise app window will be in background
    HideWindow
    !insertmacro StartApp
  !macroend

  !ifdef ONE_CLICK
    # https://github.com/electron-userland/electron-builder/pull/3093#issuecomment-403734568
    !ifdef RUN_AFTER_FINISH
      ${ifNot} ${Silent}
      ${orIf} ${isForceRun}
        !insertmacro doStartApp
      ${endIf}
    !else
      ${if} ${isForceRun}
        !insertmacro doStartApp
      ${endIf}
    !endif
    !insertmacro quitSuccess
  !else
    # for assisted installer run only if silent, because assisted installer has run after finish option
    ${if} ${isForceRun}
    ${andIf} ${Silent}
      !insertmacro doStartApp
    ${endIf}
  !endif
  ; ---- installSection.nsh 内容结束 ----
SectionEnd

Function setInstallSectionSpaceRequired
  !insertmacro setSpaceRequired ${INSTALL_SECTION_ID}
FunctionEnd