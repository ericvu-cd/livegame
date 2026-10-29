export function pageURL(filename) {
  const url=new URL(filename,location.href);
  const params=new URLSearchParams(location.search);
  if(params.get('demo')==='1')url.searchParams.set('demo','1');
  if(['localhost','127.0.0.1'].includes(location.hostname)&&params.get('emulator')==='1')url.searchParams.set('emulator','1');
  return url;
}

// Make the backend mode explicit even after connection text is refreshed.
const indicator=document.getElementById('connection');
if(indicator){
  const params=new URLSearchParams(location.search);
  indicator.dataset.backend=params.get('demo')==='1'?'demo':params.get('emulator')==='1'?'emulator':'firebase';
  indicator.title=indicator.dataset.backend==='demo'?'本機示範，不寫入 Firebase；跨設備測試請移除 demo=1 並完成 Firebase 設定。':indicator.dataset.backend==='emulator'?'本機模擬器，不寫入正式 Firebase。':'Firebase 資料庫模式；連線與寫入仍需專案登入及權限設定。';
}

