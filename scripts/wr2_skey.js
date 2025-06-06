/***********************************
 * 微信读书 skey 更新器 (Quantumult X 版)
 * 
 * 功能说明：
 * 该脚本从微信读书请求头中提取 skey 值，
 * 并拦截变更 Obsidian 微信读书插件更新 skey 的请求
 * 建议不同步时关闭脚本以节约系统资源
 * 
 * 配置说明：
 * [rewrite_local]
 * # 微信读书 skey 捕获
 * ^https?:\/\/i\.weread\.qq\.com\ url script-request-header weread_skey_updater.js
 * 
 * [mitm]
 * hostname = i.weread.qq.com
 ***********************************/

// 创建环境对象
const $ = new Env("weread");

!(async () => {
  // 获取请求URL
  const url = $request.url;

  // 路由匹配器 - 用于识别不同API请求
  const routeMatcher = {
    // pay
    balance: /\/pay\/balance/.test(url),
    // 精确匹配阅读数据详情API
    dataDetail: /\/readdata\/detail/.test(url),
    // 精确匹配用户笔记本API
    userNotebooks: /\/user\/notebooks/.test(url),
    // 动态匹配书籍相关API（章节信息、书签列表、书籍信息、阅读信息）
    bookAPIs: /\/book\/(chapterInfos|bookmarklist|info|readinfo)/.test(url),
    // 精确匹配评论列表API
    reviewAPIs: /\/review\/list/.test(url),
  };
  
  // 解构赋值，方便后续使用
  const { balance, dataDetail, userNotebooks, bookAPIs, reviewAPIs } = routeMatcher;

  // 判断是否是微信读书App内请求 - 通过User-Agent判断
  const isWeReadApp = $request.headers["User-Agent"].includes("WeRead");

  // 处理流程分支：App请求和非App请求分别处理
  if (isWeReadApp) {
    // 如果是App请求且是阅读数据详情接口，处理skey提取和保存
    if(balance) {
      // 首先检查是否已经有保存的skey
      const existingSkey = $prefs.valueForKey("weread_skey");
      const currentSkey = $request.headers["skey"] || $request.headers["Skey"] || "";
      
      // 只有当没有保存过skey或当前skey与保存的不同时才进行处理
      if (!existingSkey || (currentSkey && existingSkey !== currentSkey)) {
        await extractAndSaveSkey();
      } else {
        $.log(`已有保存的skey，跳过提取: ${currentSkey}`);
        $done({});
      }
    }
  } else {
    // // 如果是非App请求（如Obsidian插件请求）且是特定API，处理Cookie替换
    // if (userNotebooks || bookAPIs || reviewAPIs) {
    //   injectSkeyCookie();
    // } 
  }
})()
  .catch((e) => $.logErr(e))  // 捕获并记录错误
  .finally(() => $.done());    // 完成请求处理

/**
 * 从请求头中提取skey并保存到QX持久化存储
 * 避免重复提取相同的skey
 */
async function extractAndSaveSkey() {
  try {
    $.log("微信读书 skey 提取器运行中...");

    // 从请求头中获取 skey (兼容大小写)
    const skey = $request.headers["skey"] || $request.headers["Skey"] || "";

    // skey为空则退出
    if (!skey) {
      $.log("请求头中未找到 skey");
      $done({});
      return;
    }

    // 保存到 Quantumult X 持久化存储中
    $prefs.setValueForKey(skey, "weread_skey");

    // 拼接 Bark 推送 URL
    const barkURL = `https://api.day.app/VBsbtkpzHhDiTCxSYFZHAP/WeRead%20Skey%20Updated/${encodeURIComponent(skey)}`;

    // 使用 $httpClient GET 方法触发推送
    $httpClient.get({ url: barkURL }, (err, resp, data) => {
      if (err) {
        $.log(`Bark 推送失败: ${err}`);
      } else {
        $.log(`skey 已发送至 Bark: ${skey}`);
      }
      $done({});
    });

    // 通知用户skey保存成功
    $.msg(`微信读书skey已更新`, `新的skey已保存`, skey);
    $done();
  } catch (e) {
    // 异常处理
    $.log(`提取skey时发生错误: ${e.message}`);
    $done({});
  }
}

/**
 * 处理Obsidian插件请求，将保存的skey注入到Cookie中
 * 从QX存储中获取skey并替换请求的Cookie
 */
function injectSkeyCookie() {
  // 从持久化存储中获取之前保存的skey
  const skey = $prefs.valueForKey("weread_skey");
  
  // 检查是否有保存的skey
  if (!skey) {
    $.msg("微信读书同步失败", "未找到保存的skey", "请先通过微信读书App生成并保存skey");
    $done({});
    return;
  }
  
  // 获取原始请求的Cookie
  let originalCookie = $request.headers["cookie"] ||$request.headers["Cookie"] || "";

  // Cookie为空则通知并退出
  if (!originalCookie) {
    $.msg("微信读书同步失败", "Cookie为空，请确认微信读书登录状态");
    $done({});
    return;
  } else {
    // 检查Cookie中是否已有wr_skey
    const hasWrSkey = /wr_skey=[^;|`]+/.test(originalCookie);
    let newCookie;
    
    if (hasWrSkey) {
      // 替换Cookie中的wr_skey参数
      newCookie = originalCookie.replace(
        /wr_skey=[^;|`]+/,  // 匹配wr_skey及其值
        `wr_skey=${skey}`   // 替换为新的skey值
      );
    } else {
      // 如果Cookie中没有wr_skey，则添加它
      newCookie = originalCookie + `; wr_skey=${skey}`;
    }
    
    $.log("已注入skey到Cookie中");

    // 创建新的headers对象（避免修改只读对象导致错误）
    const newHeaders = {
      ...$request.headers,   // 展开原始headers
      Cookie: newCookie,     // 覆盖Cookie字段
    };
    
    // 返回修改后的请求头
    $done({ headers: newHeaders });
  }
}

/***************** Env 工具类 *****************/
// 精简的Quantumult X环境工具类 - 来源：https://github.com/chavyleung/scripts/blob/master/Env.min.js
// 提供了平台检测、持久化存储、HTTP请求、日志记录等功能

function Env(a,b){var c=Math.floor;return new class{constructor(a,b){this.name=a,this.version="1.7.4",this.data=null,this.logs=[],this.isMute=!1,this.isNeedRewrite=!1,this.logSeparator="\n",this.encoding="utf-8",this.startTime=new Date().getTime(),Object.assign(this,b),this.log("",`🔔${this.name}, 开始!`)}platform(){return"undefined"!=typeof $environment&&$environment["surge-version"]?"Surge":"undefined"!=typeof $environment&&$environment["stash-version"]?"Stash":"undefined"==typeof module||!module.exports?"undefined"==typeof $task?"undefined"==typeof $loon?"undefined"==typeof $rocket?"undefined"==typeof Egern?void 0:"Egern":"Shadowrocket":"Loon":"Quantumult X":"Node.js"}isQuanX(){return"Quantumult X"===this.platform()}isSurge(){return"Surge"===this.platform()}isLoon(){return"Loon"===this.platform()}isShadowrocket(){return"Shadowrocket"===this.platform()}isStash(){return"Stash"===this.platform()}isEgern(){return"Egern"===this.platform()}toObj(a,b=null){try{return JSON.parse(a)}catch{return b}}toStr(a,b=null){try{return JSON.stringify(a)}catch{return b}}lodash_get(a={},b="",c=void 0){Array.isArray(b)||(b=this.toPath(b));const d=b.reduce((a,b)=>Object(a)[b],a);return d===void 0?c:d}lodash_set(a={},b="",c){return Array.isArray(b)||(b=this.toPath(b)),b.slice(0,-1).reduce((a,c,d)=>Object(a[c])===a[c]?a[c]:a[c]=/^\d+$/.test(b[d+1])?[]:{},a)[b[b.length-1]]=c,a}toPath(a){return a.replace(/\[(\d+)\]/g,".$1").split(".").filter(Boolean)}getItem(a=new String,b=null){let c=b;switch(a.startsWith("@")){case!0:const{key:b,path:d}=a.match(/^@(?<key>[^.]+)(?:\.(?<path>.*))?$/)?.groups;a=b;let e=this.getItem(a,{});"object"!=typeof e&&(e={}),c=this.lodash_get(e,d);try{c=JSON.parse(c)}catch(a){}break;default:switch(this.platform()){case"Surge":case"Loon":case"Stash":case"Egern":case"Shadowrocket":c=$persistentStore.read(a);break;case"Quantumult X":c=$prefs.valueForKey(a);break;default:c=this.data?.[a]||null}try{c=JSON.parse(c)}catch(a){}}return c??b}setItem(a=new String,b=new String){let c=!1;switch(typeof b){case"object":b=JSON.stringify(b);break;default:b=b+""}switch(a.startsWith("@")){case!0:const{key:d,path:e}=a.match(/^@(?<key>[^.]+)(?:\.(?<path>.*))?$/)?.groups;a=d;let f=this.getItem(a,{});"object"!=typeof f&&(f={}),this.lodash_set(f,e,b),c=this.setItem(a,f);break;default:switch(this.platform()){case"Surge":case"Loon":case"Stash":case"Egern":case"Shadowrocket":c=$persistentStore.write(b,a);break;case"Quantumult X":c=$prefs.setValueForKey(b,a);break;default:c=this.data?.[a]||null}}return c}async fetch(a={},b={}){switch(a.constructor){case Object:a={...a,...b};break;case String:a={url:a,...b}}a.method||(a.method=a.body??a.bodyBytes?"POST":"GET"),delete a.headers?.Host,delete a.headers?.[":authority"],delete a.headers?.["Content-Length"],delete a.headers?.["content-length"];const c=a.method.toLocaleLowerCase();switch(this.platform()){case"Loon":case"Surge":case"Stash":case"Egern":case"Shadowrocket":default:return a.policy&&(this.isLoon()&&(a.node=a.policy),this.isStash()&&this.lodash_set(a,"headers.X-Stash-Selected-Proxy",encodeURI(a.policy))),a.followRedirect&&((this.isSurge()||this.isLoon())&&(a["auto-redirect"]=!1),this.isQuanX()&&(a.opts?a.opts.redirection=!1:a.opts={redirection:!1})),a.bodyBytes&&!a.body&&(a.body=a.bodyBytes,delete a.bodyBytes),await new Promise((b,d)=>{$httpClient[c](a,(c,e,f)=>{c?d(c):(e.ok=/^2\d\d$/.test(e.status),e.statusCode=e.status,f&&(e.body=f,!0==a["binary-mode"]&&(e.bodyBytes=f)),b(e))})});case"Quantumult X":return a.policy&&this.lodash_set(a,"opts.policy",a.policy),"boolean"==typeof a["auto-redirect"]&&this.lodash_set(a,"opts.redirection",a["auto-redirect"]),a.body instanceof ArrayBuffer?(a.bodyBytes=a.body,delete a.body):ArrayBuffer.isView(a.body)?(a.bodyBytes=a.body.buffer.slice(a.body.byteOffset,a.body.byteLength+a.body.byteOffset),delete object.body):a.body&&delete a.bodyBytes,await $task.fetch(a).then(a=>(a.ok=/^2\d\d$/.test(a.statusCode),a.status=a.statusCode,a),a=>Promise.reject(a.error))}}time(a,b=null){const d=b?new Date(b):new Date;let e={"M+":d.getMonth()+1,"d+":d.getDate(),"H+":d.getHours(),"m+":d.getMinutes(),"s+":d.getSeconds(),"q+":c((d.getMonth()+3)/3),S:d.getMilliseconds()};for(let c in /(y+)/.test(a)&&(a=a.replace(RegExp.$1,(d.getFullYear()+"").slice(4-RegExp.$1.length))),e)new RegExp("("+c+")").test(a)&&(a=a.replace(RegExp.$1,1==RegExp.$1.length?e[c]:("00"+e[c]).slice((""+e[c]).length)));return a}getBaseURL(a){return a.replace(/[?#].*$/,"")}isAbsoluteURL(a){return /^[a-z][a-z0-9+.-]*:/.test(a)}getURLParameters(a){return(a.match(/([^?=&]+)(=([^&]*))/g)||[]).reduce((b,a)=>(b[a.slice(0,a.indexOf("="))]=a.slice(a.indexOf("=")+1),b),{})}getTimestamp(a=new Date){return c(a.getTime()/1e3)}queryStr(a){let b=[];for(let c in a)a.hasOwnProperty(c)&&b.push(`${c}=${a[c]}`);let c=b.join("&");return c}queryObj(a){let b={},c=a.split("&");for(let d of c){let a=d.split("="),c=a[0],e=a[1]||"";c&&(b[c]=e)}return b}msg(a=this.name,b="",c="",d){const e=a=>{switch(typeof a){case void 0:return a;case"string":switch(this.platform()){case"Surge":case"Stash":case"Egern":default:return{url:a};case"Loon":case"Shadowrocket":return a;case"Quantumult X":return{"open-url":a}}case"object":switch(this.platform()){case"Surge":case"Stash":case"Egern":case"Shadowrocket":default:{let b=a.url||a.openUrl||a["open-url"];return{url:b}}case"Loon":{let b=a.openUrl||a.url||a["open-url"],c=a.mediaUrl||a["media-url"];return{openUrl:b,mediaUrl:c}}case"Quantumult X":{let b=a["open-url"]||a.url||a.openUrl,c=a["media-url"]||a.mediaUrl,d=a["update-pasteboard"]||a.updatePasteboard;return{"open-url":b,"media-url":c,"update-pasteboard":d}}}default:}};if(!this.isMute)switch(this.platform()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":default:$notification.post(a,b,c,e(d));break;case"Quantumult X":$notify(a,b,c,e(d))}}log(...a){0<a.length&&(this.logs=[...this.logs,...a]),console.log(a.join(this.logSeparator))}logErr(a,b){switch(this.platform()){case"Surge":case"Loon":case"Stash":case"Egern":case"Shadowrocket":case"Quantumult X":default:this.log("",`❗️${this.name}, 错误!`,a,b)}}wait(a){return new Promise(b=>setTimeout(b,a))}done(a={}){const b=new Date().getTime(),c=(b-this.startTime)/1e3;switch(this.log("",`🔔${this.name}, 结束! 🕛 ${c} 秒`),this.platform()){case"Surge":a.policy&&this.lodash_set(a,"headers.X-Surge-Policy",a.policy),$done(a);break;case"Loon":a.policy&&(a.node=a.policy),$done(a);break;case"Stash":a.policy&&this.lodash_set(a,"headers.X-Stash-Selected-Proxy",encodeURI(a.policy)),$done(a);break;case"Egern":$done(a);break;case"Shadowrocket":default:$done(a);break;case"Quantumult X":a.policy&&this.lodash_set(a,"opts.policy",a.policy),delete a["auto-redirect"],delete a["auto-cookie"],delete a["binary-mode"],delete a.charset,delete a.host,delete a.insecure,delete a.method,delete a.opt,delete a.path,delete a.policy,delete a["policy-descriptor"],delete a.scheme,delete a.sessionIndex,delete a.statusCode,delete a.timeout,a.body instanceof ArrayBuffer?(a.bodyBytes=a.body,delete a.body):ArrayBuffer.isView(a.body)?(a.bodyBytes=a.body.buffer.slice(a.body.byteOffset,a.body.byteLength+a.body.byteOffset),delete a.body):a.body&&delete a.bodyBytes,$done(a)}}}(a,b)}