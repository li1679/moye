import { test as base, expect } from '@playwright/test';
const sample =
  "清晨，街道还没有完全醒来。\n\n林舟推开窗，看见昨夜的雨停在树叶上。远处传来第一班电车的声音，沿着旧城的屋檐，慢慢走远。\n\n桌上放着一封没有署名的信。信纸折得很整齐，只有边角沾了一点潮气。\n\n“等到天晴，就回去看看吧。”\n\n他读了两遍，把信放进外套口袋。很多年没有踏上那条路，有些风景却一直留在记忆里：桥边的书店、午后的长椅，还有巷口那盏总是提前亮起的灯。\n\n楼下的小店已经开门。热气从蒸笼边缘升起，店主像往常一样擦着玻璃。林舟停下来，买了一份早餐，然后朝车站走去。\n\n今天的天空很明亮。";
const seed = {
  books: [
    {
      id: 1,
      name: "雨停之后",
      author: "林间",
      group: null,
      tone: "",
      chapters: [
        { name: "第1章  归途", body: sample },
        {
          name: "第2章  旧书店",
          body: "书店仍在街角。\n\n木门上的铜铃响了一声，午后的阳光落在书架边。",
        },
        { name: "第3章  一封来信", body: "" },
      ],
    },
    {
      id: 2,
      name: "山海拾记",
      author: "无名",
      group: null,
      tone: "rose",
      chapters: [
        { name: "第1章  山间", body: "风从山谷吹来，草木的影子落在石阶上。" },
      ],
    },
    {
      id: 3,
      name: "长街来信",
      author: "",
      group: 1,
      tone: "gray",
      chapters: [{ name: "第1章", body: "" }],
    },
  ],
  groups: [{ id: 1, name: "待整理" }],
};
export const test = base.extend({ page: async ({ page }, use) => {
 await page.addInitScript((seed) => {
 const req=indexedDB.open('local-editing-preview',1);
 req.onupgradeneeded=()=>req.result.createObjectStore('records',{keyPath:'id'});
 req.onsuccess=()=>{ const db=req.result; const tx=db.transaction('records','readwrite'); const store=tx.objectStore('records'); const check=store.get('schema'); check.onsuccess=()=>{ if(check.result)return; const put=(id,value)=>store.put({id,value:JSON.stringify(value)}); put('schema',1); put('groups',seed.groups); put('book-order',seed.books.map(b=>b.id)); for(const b of seed.books){const {chapters,...meta}=b; const ids=chapters.map((_,i)=>'test-'+b.id+'-'+i);put('book:'+b.id,{...meta,chapterIds:ids});chapters.forEach((c,i)=>put('chapter:'+ids[i],{...c,id:ids[i]}));} }; tx.oncomplete=()=>db.close(); };
 }, seed);
 await use(page);
 }});
export { expect };
