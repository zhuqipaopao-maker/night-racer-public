// Chinese / English. The game is written in Chinese; t() looks each string up in EN when the page runs in English.
// Placeholders {0} {1} … are filled from t()'s extra arguments. Language: ?lang=zh|en, then the player's choice in
// settings ('nr-lang'), then the browser's language (Chinese → zh, anything else → en).
// Scenery text painted into the world (shop signs, lantern-fair banners, the gantries) stays Chinese on purpose.
const pick = () => {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'zh' || q === 'en') return q;
  try { const s = JSON.parse(localStorage.getItem('nr-lang')); if (s === 'zh' || s === 'en') return s; } catch {}
  const langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en'];
  return /^zh/i.test(langs[0] || '') ? 'zh' : 'en';
};
export const LANG = pick();
document.documentElement.lang = LANG === 'zh' ? 'zh-CN' : 'en';

const fill = (s, a) => (a.length ? s.replace(/\{(\d)\}/g, (_, i) => a[i]) : s);
export function t(zh, ...a) {
  if (LANG === 'zh') return fill(zh, a);
  const en = EN[zh];
  return fill(en === undefined ? zh : en, a);
}

// Translate the static page: text nodes and placeholder/title/aria-label attributes whose whole (trimmed) text is known.
export function translateDom(root = document.body) {
  if (LANG === 'zh') return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const s = n.nodeValue.trim();
    if (s && EN[s] !== undefined) n.nodeValue = n.nodeValue.replace(s, EN[s]);
  }
  for (const el of root.querySelectorAll('[placeholder],[title],[aria-label]'))
    for (const a of ['placeholder', 'title', 'aria-label']) { const v = el.getAttribute(a); if (v && EN[v.trim()] !== undefined) el.setAttribute(a, EN[v.trim()]); }
}

const EN = {
  // ---- page ----
  '载入中…': 'Loading…', '载入地图…': 'Loading map…', '地图': 'Map', '模式': 'Mode', '对手': 'Opponents', '组别': 'Class',
  '比赛 · 对 5 辆 AI': 'Race · vs 5 AI', '计时赛 · 幽灵车': 'Time trial · ghost', '新手': 'Easy', '普通': 'Normal', '高手': 'Hard',
  '标准组 · 车性能相同': 'Standard · equal cars', '改装组 · 用你升级的车': 'Tuned · your upgraded car', '标准组': 'Standard', '改装组': 'Tuned',
  '开始比赛 ▸': 'Start race ▸', '联机 ▸': 'Online ▸', '联机': 'Online', '🚗 车库': '🚗 Garage', '🏆 排行榜': '🏆 Leaderboard', '排行榜': 'Leaderboard',
  '油门': 'Throttle', '刹车 / 倒车': 'Brake / reverse', '刹车': 'Brake', '转向': 'Steer', '漂移': 'Drift', '氮气': 'Nitro', '空格': 'Space',
  '切换视角': 'Change camera', '卡住时复位': 'Reset if stuck', '暂停': 'Pause', '油门 / 刹车倒车': 'Throttle / brake & reverse',
  '按住漂移（攒氮气）': 'Hold to drift (charges nitro)', '喷氮气': 'Nitro', '换视角': 'Camera', '左转': 'Left', '右转': 'Right',
  '左手拖转向板 · 右手按漂移 / 氮气 / 刹车': 'Left thumb: drag to steer · right thumb: drift / nitro / brake',
  '复位 ·': 'Reset ·', '换视角 ·': 'Camera ·', '雨 ·': 'Rain ·', '静音 ·': 'Mute ·', '声音设置 ·': 'Sound ·',
  '本圈': 'This lap', '上一圈': 'Last lap', '最快圈': 'Best lap', '总时间': 'Total', '第 1 圈': 'Lap 1',
  '继续 ▸': 'Resume ▸', '重新开始': 'Restart', '回主菜单': 'Main menu', '设置': 'Settings', '关闭': 'Close', '关闭 ✕': 'Close ✕',
  '键盘：Esc 继续 · R 重新开始 · Q 回主菜单': 'Keys: Esc resume · R restart · Q main menu', '联机比赛不会暂停，其他人还在跑': "Online races don't pause, the others keep driving",
  '名次': 'Pos', '车手': 'Driver', '时间': 'Time', '完赛': 'Finished', '再来一场 ▸': 'Race again ▸',
  '每人每张地图记一个最快圈，比赛和计时赛跑出来的都算。': 'One best lap per player per map, from races and time trials alike.',
  '起个名字上榜': 'Nickname', '你的名字': 'Your name', '保存': 'Save', '不要': 'No thanks',
  '房间码': 'Room code', '加入房间': 'Join room', '创建房间 ▸': 'Create room ▸', '创建后把房间码发给朋友': 'Create one, then send the code to friends',
  '复制邀请': 'Copy invite', '离开': 'Leave', '开始 ▸': 'Start ▸', '等房主开始…': 'Waiting for the host…', '等房主带大家回房间…': 'Waiting for the host to bring everyone back…',
  'AI 补位': 'AI fill-in', 'AI 数量': 'AI cars', 'AI 水平': 'AI skill', '2 辆': '2', '3 辆': '3', '对手水平': 'Opponent skill',
  '允许改装车': 'Allow tuned cars', '标准车': 'Standard cars', '玩家': 'Player', '视角': 'Camera', '自动': 'Auto', '手动按': 'Manual',
  // map list
  // map buttons: just the name in English (the weather tag made them wrap into tall stacks)
  '霓虹街区 · 雨夜': 'Neon District', '雾岭山道 · 黄昏': 'Mistridge Pass', '碧海长桥 · 晴天': 'Azure Bay Bridge',
  '长安灯火 · 元宵夜': "Chang'an Lanterns", '天空工地 · 高空': 'Skyline Site', '赤岩峡谷 · 黄昏': 'Red Rock Canyon',
  '云港城区 · 岔路': 'Metro Maze', '珊瑚深海 · 海底': 'Coral Deep', '冰原极光 · 雪夜': 'Aurora Icefield',
  '胶片公路 · 黄昏': 'Film Road', '巨像遗迹 · 古林': 'Colossus Ruins', '霓虹梦境 · 秘密': 'Synthwave Dream', '坠梦 · 长梦': 'Falling Dream',
  // maps
  '霓虹街区': 'Neon District', '雾岭山道': 'Mistridge Pass', '碧海长桥': 'Azure Bay Bridge', '长安灯火': "Chang'an Lanterns", '天空工地': 'Skyline Site',
  '赤岩峡谷': 'Red Rock Canyon', '云港城区': 'Metro Maze', '珊瑚深海': 'Coral Deep', '冰原极光': 'Aurora Icefield', '胶片公路': 'Film Road',
  '霓虹梦境': 'Synthwave Dream', '坠梦': 'Falling Dream', '巨像遗迹': 'Colossus Ruins',
  'COLOSSUS RUINS · 第十二站': 'COLOSSUS RUINS · STAGE 12',
  '只跑一圈的 5.9 公里古林长线：苔藓覆盖的原始森林吞没了远古巨像。从断裂巨像的双腿之间出发，穿过满地水洼的雾中松林，下到瀑布河谷，沿倒地巨像的手臂爬上 22 米、从它的手掌飞跃而下，钻过巨像的头颅，穿过红杉巨木林和蕨类谷，从倒下的空心巨木里钻过，再爬上 45 米高的悬崖神殿，沿石阶俯冲冲线。':
    'One 5.9 km lap through a primeval forest of moss that has swallowed ancient colossi. Start between the legs of a broken giant, through a misty pine forest full of puddles, down to the waterfall valley, up a fallen colossus\'s arm to 22 m and off its hand into the air, under the giant\'s head, through a grove of giant trees and a fern gully, through a hollow fallen giant, then up to the cliff temple 45 m high and down the stone steps to the line.',
  'NIGHT CIRCUIT · 第一站': 'NIGHT CIRCUIT · STAGE 1', 'MISTRIDGE PASS · 第二站': 'MISTRIDGE PASS · STAGE 2', 'AZURE BAY BRIDGE · 第三站': 'AZURE BAY BRIDGE · STAGE 3',
  "CHANG'AN LANTERN NIGHT · 第四站": "CHANG'AN LANTERN NIGHT · STAGE 4", 'SKYLINE SITE · 第五站': 'SKYLINE SITE · STAGE 5', 'RED ROCK CANYON · 第六站': 'RED ROCK CANYON · STAGE 6',
  'FALLING DREAM · 第七站': 'FALLING DREAM · STAGE 7', 'METRO MAZE · 第八站': 'METRO MAZE · STAGE 8', 'CORAL DEEP · 第九站': 'CORAL DEEP · STAGE 9',
  'AURORA ICEFIELD · 第十站': 'AURORA ICEFIELD · STAGE 10', 'FILM ROAD · 第十一站': 'FILM ROAD · STAGE 11',
  '雨夜的城市街道赛。转弯时按住 Shift（或 J / X）漂移，漂得越久氮气攒得越多，出弯松开还能小喷一下。':
    'A street race through the city on a rainy night. Hold Shift (or J / X) in corners to drift: the longer you drift, the more nitro you bank, and letting go on the exit gives a little boost.',
  '黄昏的盘山公路。四个连续发卡弯爬上山脊，再沿着山坡一路冲下来。发卡弯是漂移的好地方，但护栏外面就是悬崖。':
    'A mountain road at dusk. Four hairpins in a row climb to the ridge, then it plunges back down the slope. The hairpins are made for drifting, but past the guardrail is a cliff.',
  '晴天的海湾环线。从贴着海面的海堤起跑，沿海岸公路爬上灯塔所在的海角，再冲上离海面 40 米的斜拉大桥。大桥是全场最长的高速段，留好氮气。':
    'A sunny loop around the bay. Start on the sea wall right above the water, climb the coast road to the lighthouse headland, then charge across a cable-stayed bridge 40 m above the sea. The bridge is the longest flat-out stretch: save your nitro.',
  '元宵夜的长安城。沿着挂满红灯笼的朱雀大街起跑，过河畔、冲上石拱桥，再登上十二米高的城墙，穿过城楼，一路烟花相伴。':
    "Chang'an on Lantern Festival night. Start down Zhuque Avenue under rows of red lanterns, run along the river, over a stone arch bridge and up onto the 12 m city wall, through the gate tower, with fireworks all the way.",
  '在建中的摩天楼群顶上飙车。飞过楼与楼之间的断崖，开上没有护栏的塔吊吊臂，横穿未完工的大楼，螺旋爬上 165 米高的坡道塔，再从巨型跳台一跃而下冲过终点。掉下去就重来。':
    "Racing on top of skyscrapers under construction. Jump the gaps between towers, drive out along a crane jib with no rails, cut through an unfinished building, spiral up a 165 m ramp tower and leap off a giant kicker to the line. Fall off and you're back at the edge.",
  '只跑一圈的 6 公里沙漠长线：从荒漠加油站出发，钻进红岩峡谷，飞越断崖，贴着悬崖栈道穿过天然石拱，再翻过一连串沙丘冲回终点。':
    'One long 6 km lap through the desert: from a lonely gas station into the red-rock canyon, over a ravine, along a cliff ledge and through a natural stone arch, then over a run of dunes back to the line.',
  '黄昏的城市街道，路不止一条：钻老城小巷、穿中央公园，还是走滨江大道？每个路口自己选，两圈每次都可以走不一样的路。':
    'City streets at golden hour, and more than one way round: the old-town alley, the central park or the riverside drive? Pick at every junction, and take a different route each lap.',
  '一圈 5.4 公里，整条赛道都在海底：从珊瑚花园出发，穿过海草森林，钻进玻璃隧道下到深海峡谷，飞越海沟，经过沉船墓地，最后从巨大的粉色海马拱门下冲线。路边一直有粉色海马游来游去。':
    'A 5.4 km lap entirely on the sea floor: from the coral garden through a kelp forest, down a glass tunnel into a deep canyon, over a trench, past a shipwreck graveyard and across the line under a giant pink seahorse arch. Pink seahorses swim alongside all the way.',
  '极光下的冰原夜赛，一圈 4 公里跑两圈：从科考站出发，穿过雪松林，在冰封的湖面上甩过冻在冰里的古船，飞越冰裂缝，钻进冰崖峡谷，从冰川拱门下冲出，再沿着雷达站的苔原长直道全速冲线。':
    'A night race on the ice under the aurora, two laps of 4 km: from the research station through the pine forest, across a frozen lake past an old ship locked in the ice, over a crevasse, into a canyon of glacier cliffs, under a glacier arch, then flat out down the tundra straight past the radar domes.',
  '黄昏的一圈公路旅行，3.8 公里跑两圈：从樱花公园出发，穿过粉色芒草原，沿着海边栈道看摩天轮，飞驰过火山草原，钻进山城重庆的霓虹夜街，最后在演唱会体育馆的大屏幕下冲线。路边藏着一张张拍立得，留心看。':
    "A road trip at dusk, two laps of 3.8 km: from a cherry-blossom park through a pink grass meadow, along the seaside past the ferris wheel, across the volcano grassland, into Chongqing's neon hillside streets, and over the line under the stadium's big screen. Keep an eye out for the polaroids along the way.",
  '你倒着开，开进了一个不存在的地方。悬浮在紫色网格上的 8 字形赛道，在中央交叉而过，复古的夕阳永远不落。在这里倒着开，可以回去。':
    "You drove the wrong way into a place that doesn't exist. A figure-eight floating over a purple grid, crossing itself in the middle, under a retro sun that never sets. Drive the wrong way here to go back.",
  '只跑一圈的近 10 公里长梦：霓虹网格 → 雨林 → 云海之上 → 倒悬之城 → 深海玻璃隧道 → 星空尽头，最后冲进月亮，坠回起点。倒着开可以醒过来。':
    'One dream of almost 10 km: neon grid → rainforest → above the clouds → the upside-down city → a glass tunnel on the sea floor → the edge of the stars, then into the moon and falling back to the start. Drive the wrong way to wake up.',
  // ---- race and HUD ----
  '流畅': 'Smooth', '均衡': 'Balanced', '高画质': 'High', '极高': 'Ultra', '极致': 'Max',
  '疾风': 'Gale', '白鲨': 'Shark', '夜猫': 'Nightcat', '阿杰': 'Jay', '老K': 'Old K', '你': 'You',
  '追尾视角': 'Chase cam', '远景追尾': 'Far chase cam', '驾驶舱（第一人称）': 'Cockpit (first person)', '引擎盖视角': 'Hood cam',
  '复位': 'Reset', '你的最快圈：{0}': 'Your best lap: {0}', '开始比赛 · {0} 圈 ▸': 'Start race · {0} laps ▸',
  '开始计时赛 · 挑战幽灵车 ▸': 'Start time trial · beat your ghost ▸', '开始计时赛 ▸': 'Start time trial ▸',
  '🚗 车库 · {0} 个奖励待领': '🚗 Garage · {0} to claim', '连续登录第 {0} 天 · +{1} 金币': 'Day {0} in a row · +{1} coins',
  '{0} · 退还 +{1} 金币': '{0} · refunded +{1} coins', '、': ', ',
  '坠入更深的梦……': 'Falling into a deeper dream…', '正在返回现实……': 'Returning to reality…', '检测到异常时空……': 'Spacetime anomaly detected…',
  '欢迎来到 霓虹梦境': 'Welcome to the Synthwave Dream', '坠梦 · 这一次，只有一圈': 'Falling Dream · this time, just one lap', '你回来了。刚才那是梦吗？': 'You are back. Was that a dream?',
  '总音量': 'Master volume', '车辆（引擎、轮胎、风噪）': 'Car (engine, tyres, wind)', '雨声': 'Rain', '音效（碰撞、倒计时、提示）': 'Effects (crashes, countdown, alerts)', '音乐（霓虹梦境）': 'Music (Synthwave Dream)',
  '画面': 'Graphics', '画质': 'Quality', '回到主菜单后生效': 'Takes effect back in the main menu', '卡顿或手机发烫时选「流畅」。切换后会重新载入。': 'Pick "Smooth" if it stutters or your phone gets hot. Changing it reloads the page.',
  '卡顿时自动降画质': 'Lower quality when it stutters', '开': 'On', '关': 'Off', '关掉后始终保持你选的画质，哪怕掉帧。': 'When off, your chosen quality stays even if the frame rate drops.',
  '反光强度': 'Reflections', '操作': 'Controls', '转向方式': 'Steering', '滑动转向板': 'Drag pad', '左右按钮': 'Left/right buttons', '转向灵敏度': 'Steering sensitivity', '声音': 'Sound',
  '语言': 'Language', '离开房间': 'Leave room', '下雨': 'Rain on', '雨停了': 'Rain off', '静音': 'Muted', '声音开': 'Sound on',
  '第 {0} 名': 'P{0}', '跑完 {0} 圈': '{0} laps done', '漂移 {0} 秒': 'Drift {0} s', '腾空 {0} 次': 'Airtime ×{0}', '氮气 {0} 次': 'Nitro ×{0}', '刷新最快圈': 'New best lap',
  '最后一圈！': 'Final lap!', '最快圈！{0}': 'Best lap! {0}', '排行榜第 {0} 名': 'Leaderboard #{0}', '单圈 {0}': 'Lap {0}', '+{0} 金币': '+{0} coins',
  '每日任务完成！去车库领奖励': 'Daily task done! Claim it in the garage', '冠军！': 'Winner!', '第 {0} 名完赛': 'Finished P{0}', '行驶中': 'Racing', '冠军': 'Winner',
  '回到房间再来一局 ▸': 'Back to the room for another ▸', '✓ 每日任务完成：{0}（去车库领取）': '✓ Daily task done: {0} (claim it in the garage)',
  '小喷！': 'Mini boost!', '氮气 +1': 'Nitro +1', '氮气！': 'Nitro!', '最远一跳！{0} 米 · {1} 秒': 'Longest jump! {0} m · {1} s', '腾空 {0} 秒 · {1} 米': 'Airborne {0} s · {1} m', '腾空 {0} 秒': 'Airborne {0} s',
  '第 {0} / {1} 圈': 'Lap {0} / {1}', '第 {0} 圈': 'Lap {0}', '掉下去了！': 'Off the edge!', '侧风！': 'Crosswind!',
  '帧数被系统限制在 30（可能开了低电量模式）': 'The system caps the frame rate at 30 (low power mode?)', '画面已自动调低，保持流畅': 'Lowered the graphics to keep it smooth', '已关闭阴影，保持流畅': 'Turned shadows off to keep it smooth',
  '{0} FPS · 渲染倍率 {1}': '{0} FPS · render scale {1}',
  '没有这个房间，检查一下房间码。': 'No such room: check the code.', '房间满了（最多 5 人）。': 'The room is full (5 players max).', '这个房间正在比赛，等这一局结束再加入。': 'This room is racing: join when the race is over.',
  '连不上联机服务器，检查网络后再试。': "Can't reach the online server. Check your connection and try again.", '返回': 'Back', '房间码是 4 位字母或数字。': 'Room codes are 4 letters or digits.',
  '连接中…': 'Connecting…', '来玩赛车！打开 https://night-racer.pages.dev/#{0} ，点「联机」就能加入，房间码 {0}': 'Come race! Open https://night-racer.pages.dev/#{0} and tap "Online" to join, room code {0}',
  '地图：{0} · {1} 圈 · 玩家之间不碰撞': 'Map: {0} · {1} laps · players pass through each other', '房主': 'Host', '（你）': '(you)',
  '{0} 离开了': '{0} left', '联机断开了，继续单人跑完这一局': 'Disconnected: finish this race on your own', '和服务器的连接断开了。': 'Lost the connection to the server.',
  '已复制，粘贴到微信群发给朋友。': 'Copied: paste it to your friends.',
  // ---- garage ----
  '车库': 'Garage', '车辆': 'Cars', '车漆': 'Paint', '底盘灯': 'Underglow', '完成 ✓': 'Done ✓', '极速': 'Speed', '加速': 'Accel', '操控': 'Grip',
  '改装只在「改装组」生效；标准组里大家的车性能一样，只有外观不同。': 'Upgrades only count in the Tuned class; in Standard every car performs the same and only looks different.',
  '✓ 正在使用': '✓ In use', '点击换上': 'Tap to use', '🪙 {0} 购买': 'Buy · 🪙 {0}', '金币不够，还差 {0}。': 'Not enough coins: {0} short.',
  '升级 · {0}': 'Upgrades · {0}', '已满级': 'Maxed', '升级 🪙 {0}': 'Upgrade 🪙 {0}', '每日任务 · 连续登录 {0} 天': 'Daily tasks · {0} days in a row',
  '{0} / {1} · 奖励 🪙 {2}': '{0} / {1} · reward 🪙 {2}', '已领取': 'Claimed', '领取 ▸': 'Claim ▸', '进行中': 'In progress',
  '赚金币：比赛名次、漂移、腾空、用氮气、刷新最快圈都有奖励；计时赛每跑一圈也给。': 'Earn coins for finishing places, drifts, airtime, nitro and new best laps; time trials pay for every lap too.',
  '兑换码': 'Gift code', '兑换': 'Redeem', '兑换成功，获得 🪙 {0}！': 'Redeemed: 🪙 {0}!', '这个兑换码已经用过了。': 'This code has already been used.', '兑换码不对，检查一下再试。': "That code doesn't work: check it and try again.",
  '街头 GT': 'Street GT', '超跑': 'Hypercar', '均衡的街头跑车，什么路都能开。': 'A balanced street racer that handles any road.', '最快的车，极速和加速都是顶级。': 'The fastest car: top-class speed and acceleration.',
  '降价差价': 'price cut difference', '小钢炮': 'Hot hatch', '肌肉车': 'Muscle car',
  '引擎': 'Engine', '极速和加速': 'speed, accel', '轮胎': 'Tyres', '过弯抓地': 'grip', '氮气时长和攒气速度': 'duration, charge',
  '烈焰红': 'Flame red', '珍珠白': 'Pearl white', '曜石黑': 'Obsidian', '电光蓝': 'Electric blue', '柠檬黄': 'Lemon', '薄荷绿': 'Mint', '日落橙': 'Sunset orange',
  '樱花粉': 'Sakura pink', '皇家紫': 'Royal purple', '香槟金': 'Champagne', '枪灰': 'Gunmetal', '宝石青': 'Teal',
  '青色': 'Cyan', '品红': 'Magenta', '翠绿': 'Green', '琥珀': 'Amber', '纯白': 'White',
  '累计漂移 40 秒': 'Drift for 40 s in total', '腾空飞过 20 米以上 3 次': 'Fly more than 20 m 3 times', '赢得 1 场比赛（第一名）': 'Win 1 race (1st place)',
  '跑完 3 场比赛': 'Finish 3 races', '使用 8 次氮气': 'Use nitro 8 times', '拿到 2 次前三名': 'Finish in the top 3 twice', '在云港城区走 2 次岔路': 'Take 2 side roads in Metro Maze',
  '跑完 6 圈（任意地图、任意模式）': 'Complete 6 laps (any map, any mode)', '一场比赛赚到 400 金币': 'Earn 400 coins in one race',
  // ---- leaderboard ----
  '加载中…': 'Loading…', '连不上排行榜服务器，稍后再试。': "Can't reach the leaderboard. Try again later.", '名字不能为空。': "The name can't be empty.",
  '这个名字含有不允许的词，换一个吧。': "That name contains a word that isn't allowed. Try another.",
  '{0}（{1}）': '{0} ({1})',
  '{0}（{1}）还没有人上榜，来当第一个吧。': 'Nobody on {0} ({1}) yet. Be the first!',
  '你的最快圈 {0}，排第 {1} 名（共 {2} 人）': 'Your best lap {0}, #{1} of {2}', '跑完一圈就能上榜（共 {0} 人）': 'Finish a lap to get on the board ({0} players)',
  '设置名字后，你的最快圈会自动上榜（共 {0} 人）': 'Set a name and your best lap goes on the board automatically ({0} players)',
  '你的昵称和最快圈会保存在排行榜服务器上，所有玩家可见。': 'Your nickname and best laps are stored on the leaderboard server and shown to all players.',
};
