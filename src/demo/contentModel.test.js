import fs from 'node:fs';
import path from 'node:path';
import {describe,expect,test} from 'vitest';
import {hasMeaningfulMarkdown,prepareSections,prepareReaderContent,skillShortTitle} from './contentModel.js';
import {bodyAtLevel,sectionModes} from './model.js';

const dataRoot=path.resolve(process.cwd(),'src/demo/__fixtures__');
const catalog=JSON.parse(fs.readFileSync(path.join(dataRoot,'index.json'),'utf8'));
const records=catalog.items.map(item=>JSON.parse(fs.readFileSync(path.join(dataRoot,item.detailFile.replace('/demo-data/','')),'utf8')));
const cyrene=records.find(p=>p.key==='hsr/characters/1415');
const dataRows=body=>body.split('\n').filter(line=>/^\s*\|\s*(?:等级\d|Lv\.?\s*\d|\d)/.test(line));

describe('content editing preserves the archive',()=>{
  test.each(['\n- ****\n','\n### 3.7\n','\n###\n','\n### 视频\n\n### 图片\n','<!-- draft -->\n---'])('removes empty markdown shell %s',body=>{
    expect(hasMeaningfulMarkdown(body)).toBe(false);
  });

  test.each(['伤害提高 10%。','![原图](https://example.com/image.png)','$$D = A \\times B$$','| 项目 | 数值 |\n| --- | --- |\n| 攻击力 | 25 |'])('keeps substantive source content %s',body=>{
    expect(hasMeaningfulMarkdown(body)).toBe(true);
  });

  test('an empty heading cannot swallow the following paragraph',()=>{
    expect(hasMeaningfulMarkdown('###\n伤害提高 10%。')).toBe(true);
    expect(hasMeaningfulMarkdown('###\n- 提高生命上限。')).toBe(true);
    expect(hasMeaningfulMarkdown('###\n\n获得 1 点能量。')).toBe(true);
  });

  test('the shipped archive only hides the twenty verified empty editorial placeholders',()=>{
    const removed=records.flatMap(record=>record.sections.filter(section=>!hasMeaningfulMarkdown(section.body)).map(section=>({key:record.key,title:section.title,body:section.body})));
    expect(removed).toHaveLength(20);
    expect([...new Set(removed.map(section=>section.key))].sort()).toEqual(['hsr/characters/1001','hsr/characters/1224','hsr/characters/1415','hsr/characters/8007']);
    for(const key of new Set(removed.map(section=>section.key))){
      expect(removed.filter(section=>section.key===key).map(section=>section.title)).toEqual(['攻略推荐','角色关系','角色解析','角色考据','角色画廊']);
    }
  });

  test('all 87 records retain every substantive section and unchanged source bodies',()=>{
    expect(records).toHaveLength(87);
    for(const record of records){
      const original=JSON.stringify(record);
      const sections=prepareSections(record);
      expect(sections.map(s=>s.id)).toEqual(record.sections.filter(s=>hasMeaningfulMarkdown(s.body)).map(s=>s.id));
      for(const section of sections){
        const source=record.sections.find(s=>s.id===section.id);
        expect(section.title).toBe(source.title);
        expect(section.body).toBe(source.body);
        expect(section.shortTitle).toBeTruthy();
        expect(section.group).toBeTruthy();
      }
      if(sections.some(s=>s.group!=='来源'))expect(sections.filter(s=>s.isPrimary)).toHaveLength(1);
      expect(JSON.stringify(record)).toBe(original);
    }
  });

  test('Cyrene gets meaningful groups and distinguishes the second skill source without deleting it',()=>{
    const sections=prepareSections(cyrene);
    expect(sections.some(s=>['攻略推荐','角色解析','角色考据','角色画廊'].includes(s.title))).toBe(false);
    expect(sections.find(s=>s.isPrimary).title).toBe('行迹');
    expect(sections.find(s=>s.title==='技能')).toMatchObject({shortTitle:'技能参数',group:'战斗',variant:'supplementary'});
    expect(sections.find(s=>s.title.startsWith('技能材料'))).toMatchObject({shortTitle:'技能材料',group:'养成'});
    expect(sections.find(s=>s.title==='语音').group).toBe('故事');
  });

  test('enemy calculation tables remain readable chapters, not hidden provenance',()=>{
    const enemies=records.filter(record=>record.category==='hsr/enemies');
    const snapshots=enemies.flatMap(record=>prepareSections(record).filter(section=>section.title.includes('属性快照')));
    expect(snapshots).toHaveLength(3);
    for(const section of snapshots){
      expect(section.group).toBe('概览');
      expect(section.shortTitle).toBe('属性与计算口径');
      expect(section.body).toContain('| 属性 | 模板基础值 | 本体倍率 | 等级乘区 | 实际 |');
    }
  });
});

describe('skill parameters have defensible labels',()=>{
  test('known labels explain all three basic attack coefficients and preserve every value',()=>{
    const source=cyrene.sections.find(s=>s.title==='行迹').body;
    const result=prepareReaderContent(source,cyrene.key);
    expect(result).toContain('| 等级 | 普攻·单体 | 强化·单体 | 强化·全体 |');
    expect(result).toContain('占昔涟生命上限的比例');
    expect(result).toContain('| 等级 | 暴击率提升 |');
    expect(dataRows(result)).toEqual(dataRows(source));
    expect(bodyAtLevel(result,'7')).toContain('| 等级7 | 55% | 33% | 33% |');
  });

  test('the alternate source uses its own actual levels and unchanged decimal values',()=>{
    const source=cyrene.sections.find(s=>s.title==='技能').body;
    const result=prepareReaderContent(source,cyrene.key);
    expect(result).toContain('| 等级 | 伤害倍率 | 获得追忆 |');
    expect(result).toContain('| 等级 | 真实伤害倍率 | 结界回合 | 获得追忆 |');
    expect(result).toContain('0.25 表示 25%');
    expect(sectionModes(result).values).toContain('15');
    expect(dataRows(result)).toEqual(dataRows(source));
  });

  test('unknown parameters remain explicitly unidentified, never borrowed from another character',()=>{
    const body='### 看，希望的起始！\n\n| 等级 | 数值1 | 数值2 |\n| --- | --- | --- |\n| 等级1 | 25% | 15% |\n\n获得1点【追忆】。';
    const result=prepareReaderContent(body,'hsr/characters/other');
    expect(result).toContain('| 等级 | 数值1 | 数值2 |');
    expect(result).toContain('未提供完整列名');
    expect(result).not.toContain('普攻·单体');
  });

  test('every transformed sample preserves its original level data rows',()=>{
    for(const record of records)for(const section of record.sections){
      expect(dataRows(prepareReaderContent(section.body,record.key))).toEqual(dataRows(section.body));
    }
  });

  test('skill navigation names abilities rather than repeatedly saying 单攻 or 辅助',()=>{
    expect(skillShortTitle('普攻 · 看，希望的起始！（单攻）')).toBe('普攻');
    expect(skillShortTitle('盛放吧，来世的乐土（战技）')).toBe('战技');
    expect(skillShortTitle('记忆的净子（额外能力）')).toBe('记忆的净子（额外能力）');
  });
});
