import {href} from './model.js';
export const WORLDS = [
  {id:'zzz', name:'绝区零', en:'ZENLESS ZONE ZERO', short:'ZZZ', category:'zzz/agents', note:'从六分街出发，认识新艾利都。', color:'#c9ec3b', subject:'安比生日插画', position:'58% 35%'},
  {id:'hsr', name:'星穹铁道', en:'HONKAI: STAR RAIL', short:'HSR', category:'hsr/characters', note:'将旅途中的每一次相遇，悉心收藏。', color:'#b9bded', subject:'三月七花束插画', position:'48% 32%'},
  {id:'currency', name:'货币战争', en:'CURRENCY WARS', short:'CW', category:'currency/season1/roles', note:'角色、羁绊与投资，下一步有据可循。', color:'#ecc494', subject:'三月七蛋糕插画', position:'50% 31%'},
];
export const worldHref=(theme,w)=>href(theme,{view:w.id==='currency'?'season':'world',category:w.category});
