import {expect,test} from 'vitest';
import {bodyAtLevel,dateLabel,infoFields,selectItems,sectionModes,nearestLevel} from './model.js';

test('same-name records stay independent across IDs and seasons',()=>{
  const items=[{key:'currency/season1/roles/1',category:'currency/season1/roles',id:'1',name:'阿哈',fields:{星阶:4}},{key:'currency/season1/roles/2',category:'currency/season1/roles',id:'2',name:'阿哈',fields:{星阶:5}},{key:'currency/season2/roles/1',category:'currency/season2/roles',id:'1',name:'阿哈',fields:{星阶:3}}];
  expect(selectItems(items,{category:'currency/season1/roles',q:'阿哈'}).map(p=>p.key)).toEqual(items.slice(0,2).map(p=>p.key));
});
test('filters combine and a missing value is distinct from zero',()=>{
  const base={category:'hsr/enemies',name:'测试',id:'1'};
  const items=[{...base,fields:{阵营:'甲',弱点:'火 / 冰',韧性:0}},{...base,id:'2',fields:{阵营:'乙',弱点:'火'}},{...base,id:'3',fields:{阵营:'甲'}}];
  expect(selectItems(items,{category:base.category,filters:{阵营:'甲',弱点:'火'}})).toHaveLength(1);
  expect(selectItems(items,{category:base.category,filters:{韧性:'__missing__'}}).map(p=>p.id)).toEqual(['2','3']);
});
test('plus variants are literal search terms',()=>{
  const items=['礼包','礼包+','礼包++'].map((name,i)=>({name,id:String(i),category:'currency/season1/strategies',fields:{}}));
  expect(selectItems(items,{category:items[0].category,q:'礼包++'}).map(p=>p.name)).toEqual(['礼包++']);
});
test('open-ended and missing dates remain distinguishable',()=>{
  expect(dateLabel({fields:{start_time_text:'正式开服后',end_open:true}})).toBe('正式开服后 — 长期');
  expect(dateLabel({fields:{}})).toBe('开始时间未提供 — 结束时间未提供');
});
test('uncertain currency healing and star labels do not become authoritative facts',()=>{
  expect(infoFields({category:'currency/season2/roles',fields:{星级:5,星阶:5,治疗护盾:'治疗',站位:'前排'}})).toEqual([['星阶',5],['站位','前排']]);
});
test('selecting skill level keeps unrelated tables and only changes level rows',()=>{
  const body='说明\n| 等级 | 数值 |\n| --- | --- |\n| 1 | 20% |\n| 2 | 40% |\n\n其他\n| 数量 | 材料 |\n| --- | --- |\n| 1 | 丁尼 |';
  const result=bodyAtLevel(body,'2');
  expect(result).toContain('| 2 | 40% |');expect(result).not.toContain('| 1 | 20% |');expect(result).toContain('| 1 | 丁尼 |');
});

test('HSR prefixed levels work after unrelated tables and preserve fixed-level abilities',()=>{
  const body='| 属性 | 值 |\n| --- | --- |\n| 1 | 保留 |\n\n| Lv. | 伤害 |\n| --- | --- |\n| Lv.1 | 25% |\n| Lv.10 | 50% |\n\n| 等级 | 数值 |\n| --- | --- |\n| 等级1 | 10% |\n| 等级10 | 20% |\n\n| 等级 |\n| --- |\n| 等级1 |';
  expect(sectionModes(body).values).toEqual(['1','10']);
  const result=bodyAtLevel(body,'10');
  expect(result).toContain('| Lv.10 | 50% |');expect(result).not.toContain('| Lv.1 | 25% |');
  expect(result).toContain('| 等级10 | 20% |');expect(result).not.toContain('| 等级1 | 10% |');
  expect(result).toContain('| 1 | 保留 |');expect(result).toContain('| 等级1 |');
});
test('multiple ZZZ rows survive at the selected level and missing levels are not fabricated',()=>{
  const body='| 等级 | 项目 | 数据 |\n| --- | --- | --- |\n| 1 | 伤害 | 31% |\n| 1 | 失衡 | 15% |\n| 3 | 伤害 | 40% |\n| 3 | 失衡 | 20% |';
  expect(sectionModes(body).values).toEqual(['1','3']);
  expect(bodyAtLevel(body,'3')).toContain('| 3 | 失衡 | 20% |');
  expect(bodyAtLevel(body,'2')).toContain('此等级未收录');
  expect(bodyAtLevel(body,'2')).not.toContain('31%');
  expect(nearestLevel(['1','2','3','4','5','6'],'10')).toBe('6');
  expect(nearestLevel(['1','2','3','4','5','6'],'4')).toBe('4');
});
test('refinement and superimposition tables expose real collected levels',()=>{
  for(const header of ['精炼','叠影','技能等级']){
    const body=`| ${header} | 效果 |\n| --- | --- |\n| ${header==='技能等级'?'等级':header}1 | 10% |\n| ${header==='技能等级'?'等级':header}5 | 20% |`;
    expect(sectionModes(body).values).toEqual(['1','5']);
    expect(bodyAtLevel(body,'5')).not.toContain('10%');
  }
});

test('hash headers identify levels only when every row explicitly declares a level',()=>{
  const levels='| # | A |\n| --- | --- |\n| Lv.1 | 0.25 |\n| Lv.7 | 0.55 |';
  expect(sectionModes(levels).values).toEqual(['1','7']);
  expect(bodyAtLevel(levels,'7')).toContain('| Lv.7 | 0.55 |');
  expect(bodyAtLevel(levels,'7')).not.toContain('0.25');
  const index='| # | 名称 |\n| --- | --- |\n| 1 | 第一条 |\n| 2 | 第二条 |';
  expect(sectionModes(index)).toBe(null);
  expect(bodyAtLevel(index,'2')).toBe(index);
});
