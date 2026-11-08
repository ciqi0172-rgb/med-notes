const els = {
  stats: document.querySelector('#stats'),
  docSwitch: document.querySelector('#docSwitch'),
  searchShell: document.querySelector('#searchShell'),
  search: document.querySelector('#searchInput'),
  clear: document.querySelector('#clearButton'),
  resultBadge: document.querySelector('#resultBadge'),
  searchPanel: document.querySelector('#searchPanel'),
  resultCount: document.querySelector('#resultCount'),
  searchHelp: document.querySelector('#searchHelp'),
  closeResults: document.querySelector('#closeResults'),
  results: document.querySelector('#resultsList'),
  content: document.querySelector('#documentContent'),
  sidebar: document.querySelector('#sidebar'),
  sidebarToggle: document.querySelector('#sidebarToggle'),
  sidebarClose: document.querySelector('#sidebarClose'),
  outlineNav: document.querySelector('#outlineNav'),
  drawerBackdrop: document.querySelector('#drawerBackdrop'),
  currentSection: document.querySelector('#currentSection'),
  currentHeading: document.querySelector('#currentHeading'),
  backTop: document.querySelector('#backTop'),
};

const DOCS = [
  { key: 'mindmap', name: '思维导图', indexUrl: './assets/search-index.json', contentUrl: './assets/content.html' },
  { key: 'kuangbei', name: '狂背', indexUrl: './assets/kuangbei-index.json', contentUrl: './assets/kuangbei-content.html' },
  { key: 'recall', name: '狂背自检', indexUrl: './assets/kuangbei-index.json', contentUrl: './assets/kuangbei-content.html' },
];

const state = {
  docIndex: 0,
  docCache: {},
  loading: false,
  index: null,
  blocks: [],
  section: '全部',
  matches: [],
  targetTimer: 0,
  sidebarOpen: false,
  sidebarCloseFocus: null,
  activeOutlineId: '',
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobileSidebar = window.matchMedia('(max-width: 900px)');
const MAX_RENDERED_RESULTS = 80;

init().catch(showLoadError);

async function init() {
  bindEvents();
  renderDocSwitcher();
  syncSidebarMode();
  await switchDoc(0, { initial: true });

  if (location.hash.length > 1) {
    window.setTimeout(() => jumpToBlock(location.hash.slice(1), { updateHash: false }), 80);
  }
}

async function fetchDoc(doc) {
  if (state.docCache[doc.key]) return state.docCache[doc.key];
  const [indexResponse, contentResponse] = await Promise.all([
    fetch(doc.indexUrl),
    fetch(doc.contentUrl),
  ]);
  if (!indexResponse.ok) throw new Error(`${doc.key} index: ${indexResponse.status}`);
  if (!contentResponse.ok) throw new Error(`${doc.key} content: ${contentResponse.status}`);
  const data = { index: await indexResponse.json(), html: await contentResponse.text() };
  state.docCache[doc.key] = data;
  return data;
}

async function switchDoc(docIndex, { initial = false } = {}) {
  if (state.loading || (!initial && docIndex === state.docIndex)) return;
  state.loading = true;
  try {
    const doc = DOCS[docIndex];
    const data = await fetchDoc(doc);

    state.docIndex = docIndex;
    state.index = data.index;
    state.blocks = data.index.blocks || [];
    state.matches = [];
    state.activeOutlineId = null;
    els.content.innerHTML = data.html;
    if (doc.key === 'recall') applyRecallMasks();

    els.search.value = '';
    els.resultBadge.textContent = '';
    setSearchPanel(false);

    renderDocSwitcher();
    renderStats();
    renderOutline();
    runSearch();
    window.scrollTo({ top: 0, behavior: 'auto' });
    history.replaceState(null, '', location.pathname);
    updateCurrentHeading();
  } finally {
    state.loading = false;
  }
}

const RECALL_TARGETS = [
  // COPD：按用户逐项指定的检查、诊断阈值、分级特征与治疗考点
  '肺功能', '一秒率', 'FEV1/FVC', '仍<70%', 'FEV1%pred',
  '≥80%', '50-79%', '30-49%', '<30%',
  'PaCO2↑', '动脉血气分析', '继之呼吸困难', 'X 线',
  '≤1 次', '≥2 次', '剧烈',
  '沙丁胺醇/特布他林', '异丙托溴铵', '沙美特罗/福莫特罗', '噻托溴铵',
  'LABA+LAMA', 'LABA+LAMA+ICS',
  '抗生素', '吸入支气管扩张剂', '口服或静注激素', '低流量吸氧',
  'pH<7.2', '吗啡',

  // 补充：按原文逐科补齐检查、诊断阈值、鉴别特征、分级和治疗决策
  '肺动脉高压',
  '不常规用利尿剂',
  '呼酸合并代碱',
  '西地那非',
  '利奥西呱',
  '突发呼吸困难',
  '肺动脉造影',
  'D-二聚体',
  'CTPA',
  'FeNO',
  '痰嗜酸性粒细胞',
  '大量脓痰',
  '多有咯血和杵状指',
  '肺泡蛋白沉着症',
  '全肺灌洗',
  'PAS(+)',
  '避免接触抗原',
  '顽固性低氧血症',
  '呼气末正压 PEEP',
  '小潮气量',
  '俯卧位通气',
  'EGFR/HER1/ERBB1',
  '厄洛替尼',
  '吉非替尼',
  '胸膜固定术',
  '夜间阵发性呼吸困难',
  '端坐呼吸',
  '植入型心律转复除颤器 ICD',
  '心律绝对不齐',
  '脉搏短绌',
  'P 波消失',
  '350-600 次/分',
  '完全性代偿间隙',
  '肾动脉造影确诊',
  '室间隔 15mm',
  '收缩期二尖瓣前叶向前移动',
  '各心腔可扩大',
  '室壁变薄',
  '心包摩擦音',
  'Beck 三联征',
  '心包穿刺',
  'ST 段弓背向下抬高',
  '心包叩击音',
  'Kussmaul 征',
  '脑栓塞最常见',
  'Osler 结',
  'Roth 斑',
  '质子泵抑制剂 PPI',
  '钾离子竞争性酸阻滞剂 P-CAB',
  'Barrett 食管',
  '壁细胞和内因子抗体阳性',
  '胃泌素增加',
  '胃泌素减少',
  'Hp(+)',
  '呕吐后不缓解',
  '闭袢性梗阻',
  '自发性腹膜炎',
  '门静脉血栓形成',
  'Child C 级',
  'TACE',
  '≤48 小时',
  '>48 小时',
  '变形红细胞',
  '红细胞管型',
  '系膜区 IgA 沉积',
  '有效循环血量',
  '肾灌注不足',
  '罗沙司他',
  '血肌酐≥177',
  '肌酐清除率≤40',
  '发热>38 度',
  '半年内体重下降>10%',
  'TRAb',
  '甲亢周期性瘫痪',
  '大剂量碘',
  '血皮质醇失去昼夜节律',
  '经蝶窦切除肿瘤',
  '螺内酯（首选）',
  '血、尿儿茶酚胺及其代谢物',
  '胰高血糖素激发试验',
  '口服葡萄糖耐量试验',
  '抗核抗体 ANA',
  'dsDNA',
  '抗 ENA 抗体谱',
  '抗 Sm',
  '甲氨蝶呤',
  '乌帕替尼',
  '西维美林',
  '毛果芸香碱',
  '反复口腔溃疡',
  '反复外阴溃疡',
  '针刺反应',
  '戒断综合征',
  '25-30kcal/kg',
  '70-80%',
  '蛋白质和脂肪分解加强',
  '气管软化塌陷',
  '喉头水肿',
  '双侧喉返神经损伤',
  '乳头凹陷',
  '导管上皮非典型/异型增生',
  '压缩量<20%',
  '纵隔扑动',
  '直肠指检',
  '弹簧或杯口状',
  '胆总管扩张 > 10mm',
  '超声内镜',
  '判断胆管癌浸润深度',
  '进行性排尿困难',
  '经尿道前列腺切除术 TURP',
  '肾盂切开取石',

  // 补齐当前覆盖较少的栏目：血源性肺脓肿、心肌炎、贫血、风湿与外科处置
  '金葡菌多见',
  '苯/氯唑西林或头孢呋辛',
  '1-3 周前驱感染病史',
  '病理 q 波',
  '心肌坏死标志物↑',
  '定期随访',
  '不用激素+环磷酰胺',
  'MCHC',
  'Hb 男<120',
  '女<110',
  '孕妇<100',
  '>90、60-90、30-59、<30',
  '抗着丝点',
  '抗 Scl-70 抗体',
  'Gottron 征',
  '抗合成酶和 Jo-1 抗体',
  '甲硫咪唑/他巴唑 MMI',
  '丙硫氧嘧啶 PTU',
  '首选全切、近全切',
  '患侧叶或部分切+冰冻切片',
  '<1 和五个无',
  '经腹股沟管内口',
  '经海氏/Hesselbach 三角',
  '寒战高热',
  '胆道梗阻（最主要）',
  '液性暗区，常为多个',
  '肺外野多发空洞及液气囊腔',

  // 全文补充：检查金标准、急症处理、典型分级与术后关键节点
  '心动过缓用地平', '心动过速用地尔硫卓', '前列环素',
  '支气管镜活检', '低剂量 CT',
  '同步直流电复律', '非同步直流电复律', '起搏器',
  '胸外按压 C→开通气道 A→人工呼吸 B', '肾上腺素',
  '360J', '120-200J',
  '食管反流监测', 'pH 监测',
  '穿刺活检见假小叶', '胃镜', '腹腔穿刺抽液',
  '血氨', '脑电图', 'AFP>400',
  '小剂量地塞米松抑制试验(-)', '大剂量地塞米松抑制试验(+)',
  '血醛固酮↑、肾素↓、AngII↓',
  '血钙', 'PTH', '超声最常用、核素最准确',
  '细针穿刺细胞学', '结肠镜', 'MRCP',
  '术后 2 周', '术后 4 周',
  '体外冲击波碎石 ESWL', '经皮肾镜碎石取石 PCNL',
  '禁用 CCB', '抗环瓜氨酸肽 CCP', '唇腺活检',
  'Schirmer 滤纸试验',

  // 呼吸：诊断阈值、分组治疗、急性加重与鉴别
  '仍<70%', '≥80%', '50-79%', '30-49%', '≥2 次',
  'LABA+LAMA', '血嗜酸性粒细胞≥300', '氧流量 1-2L/分',
  'pH<7.2', '无意识状态改变', '有意识状态改变',
  '500 排除诊断', '≥3 个月', '长期甚至终身', '低危：抗凝，不溶栓',
  '收缩压<90', '仅用于非发作期', '变异率大', '不用地塞米松',
  '白三烯调节剂（孟鲁司特）', '干性支扩：反复咯血',
  '痰分 4 层', '痰分 3 层', '6-8 周',
  // 循环：心衰关键指标、用药禁忌与心律失常辨析
  'LVEF≤40%', 'E/e\'≥15', 'PCWP≥18', '心脏指数 CI≤2.2',
  '预激综合征伴房颤', '变异型心绞痛',
  '房颤不用', '急性右室梗死',
  // 消化：典型鉴别、急症处理、肝硬化并发症
  '进食→疼痛→缓解', '疼痛→进食→缓解',
  '首先禁食补液和胃肠减压', '首先禁食和胃减压',
  '肝移植（最有效）', '头孢哌酮/喹诺酮',
  '收缩压<90 补充血容量', '利尿速度不宜过快',
  'Cullen/G-T 征', '血脂肪酶特异性优于血淀粉酶',
  // 肾脏与内分泌：重要治疗选择、停药界限
  '单纯血尿（主要）：对症', 'ACEI/ARB',
  '妊娠 1-3 月首选丙硫氧嘧啶 PTU',
  'N<1.5（WBC<3）→停药（不是换药）',
  '甲亢术前准备要求 BMR<20%',
  // 风湿、外科：高频鉴别与关键处置
  'UC 连续溃疡浅、CD 节段鹅卵石',
  '手术同时抗休克', '威胁最大→立即穿刺抽气',
  'Mirizzi 征', '≤3 天急诊 LC', '>3 天急诊 PTGD',
  'MRPA、放射性核素肺通气/血流灌注', '活动性动脉出血或裸露血管用 PPI+胃镜'
];


const CHAPTER_TARGETS = {
  b00007: ['肺功能','一秒率','≥80%','50-79%','30-49%','<30%','LABA+LAMA','LABA+LAMA+ICS','低流量吸氧'], // 保留指标名称，重点回忆诊断界值与 GOLD 严重程度分级
  b00008: ['不常规用利尿剂','呼酸合并代碱','右心室前壁厚度≥5mm','残根征','肺型 P 波'],
  b00010: ['右心导管','心动过缓用地平','心动过速用地尔硫卓','前列环素','利奥西呱'],
  b00011: ['<500 排除诊断','首选 CTPA','金标准肺动脉造影','低危：抗凝，不溶栓','长期甚至终身'],
  b00012: ['支气管激发试验阳性','支气管舒张试验阳性','PEF 变异率大','白三烯调节剂（孟鲁司特）','ICS'],
  b00015: ['大量脓痰','多有咯血和杵状指','痰分 4 层','痰分 3 层','HRCT'],
  b00016: ['脆弱拟杆菌','甲硝唑+林可霉素','6-8 周'],
  b00018: ['金葡菌多见','血培养','苯/氯唑西林或头孢呋辛'],
  b00019: ['尿抗原检测','首选青霉素','万古霉素/替考拉宁/利奈唑胺','先补液'],
  b00020: ['哑铃状影','三均匀','虫蚀样空洞','痰培养','HRZE'],
  b00022: ['PAS(+)','全肺灌洗','避免接触抗原','尼达尼布','吡非尼酮'],
  b00024: ['顽固性低氧血症','氧合指数','小潮气量','俯卧位通气','呼气末正压 PEEP'],
  b00025: ['周围型','中央型','EGFR/HER1/ERBB1','厄洛替尼','吉非替尼'],
  b00029: ['ADA','化学性胸膜固定术','引流+抗生素','胸膜反应','尽快抽净胸水'],
  b00047: ['LVEF≤40%',"E/e'≥15",'PCWP≥18','心脏指数 CI≤2.2','ARNI'],
  b00053: ['同步直流电复律','非同步直流电复律','起搏器','心律绝对不齐','P 波消失'],
  b00054: ['硝普钠','尼卡地平','拉贝洛尔','ACEI/ARB/ARNI','<140/90'],
  b00056: ['主动脉增强 CT','肾动脉造影确诊','禁用 ACEI/ARB/ARNI'], // 仅保留本节原文确实出现的知识点
  b00059: ['室间隔 15mm','收缩期二尖瓣前叶向前移动','禁用正性肌力药','禁用正性肌力药','大量利尿剂'],
  b00061: ['各心腔可扩大','室壁变薄','室壁运动普遍/弥漫减弱','同慢性心衰'],
  b00063: ['1-3 周前驱感染病史','病理 q 波','心肌坏死标志物↑','心肌坏死标志物↑'],
  b00064: ['心包摩擦音','Beck 三联征','心包穿刺','Kussmaul 征','奇脉'],
  b00066: ['心包叩击音','负性心尖搏动','Kussmaul 征','超声心动图'],
  b00083: ['血培养','经食管超声心动图 TEE','脑栓塞最常见','Osler 结','Roth 斑'],
  b00085: ['胸外按压 C→开通气道 A→人工呼吸 B','肾上腺素','360J','120-200J'],
  b00090: ['食管反流监测','pH 监测','PPI','Barrett 食管'],
  b00092: ['壁细胞和内因子抗体阳性','胃泌素增加','胃泌素减少','Hp(+)','VitB12↓'],
  b00094: ['进食→疼痛→缓解','疼痛→进食→缓解','首先禁食补液和胃肠减压','活动性动脉出血或裸露血管','PPI'],
  b00120: ['自发性腹膜炎','门静脉血栓形成','蜘蛛痣','侧枝循环','腹水'],
  b00122: ['血氨','脑电图','乳果糖','利福昔明'],
  b00123: ['AFP>400','AFP>400','TACE','肝区疼痛'],
  b00125: ['呕吐不减轻','Cullen/G-T 征','血脂肪酶特异性优于血淀粉酶','≤48 小时','>48 小时'],
  b00132: ['VitA 结合蛋白','溢出性蛋白尿','血红蛋白','肌红蛋白'],
  b00133: [],
  b00135: ['泼尼松每天 1mg/kg','8-12 周','糖皮质激素','环磷酰胺','膜性肾病'],
  b00136: ['1-3 天感染病史','系膜区 IgA 沉积','单纯血尿（主要）：对症','ACEI/ARB'],
  b00138: ['定期随访','不用激素+环磷酰胺'],
  b00140: ['白细胞管型','3 日短程','7 日 2 周','T>38'],
  b00142: ['有效循环血量','肾灌注不足','尿比重<1.012','尿钠>20','棕色颗粒管型'],
  b00143: ['罗沙司他','司维拉姆','碳酸镧','限磷'],
  b00159: ['Hb 男<120','女<110','孕妇<100','MCHC','>90、60-90、30-59、<30'],
  b00161: ['血肌酐≥177','肌酐清除率≤40','血钙','M 蛋白量','CRAB'],
  b00163: ['发热>38 度','半年内体重下降>10%','膈肌同侧≥2 组淋巴结','骨髓穿刺'],
  b00174: ['TRAb','甲亢术前准备要求 BMR<20%','妊娠 1-3 月首选丙硫氧嘧啶 PTU','N<1.5'],
  b00175: ['血皮质醇失去昼夜节律','低钾碱中毒','小剂量地塞米松抑制试验(-)','大剂量地塞米松抑制试验(+)'],
  b00176: ['血醛固酮↑、肾素↓、AngII↓','螺内酯（首选）','低血钾'],
  b00178: ['血、尿儿茶酚胺及其代谢物','胰高血糖素激发试验','酚苄明'],
  b00180: ['血浆渗透压>320','尿酮强阳性','补液','胰岛素'], // 本节原文未出现口服葡萄糖耐量试验
  b00184: ['抗着丝点','抗 Scl-70 抗体','Gottron 征','抗合成酶和 Jo-1 抗体'],
  b00186: ['抗环瓜氨酸肽 CCP','甲氨蝶呤','乌帕替尼','晨僵'],
  b00187: ['抗核抗体 ANA','dsDNA','抗 ENA 抗体谱','抗 Sm','蛋白尿'],
  b00188: ['唇腺活检','Schirmer 滤纸试验','西维美林','毛果芸香碱'],
  b00190: ['反复口腔溃疡','反复外阴溃疡','针刺反应','活检','利妥昔单抗'],
  b00212: ['最短禁食时间','清饮料 2h','术前 2-3 天停服','手术日晨停用'],
  b00213: ['25-30kcal/kg','70-80%','蛋白质和脂肪分解加强','前白蛋白','氮平衡'],
  b00241: ['气管软化塌陷','喉头水肿','双侧喉返神经损伤','PTU（首选）','禁用阿司匹林'],
  b00243: ['细针穿刺细胞学','<1 和五个无','131I','甲状腺球蛋白 TG'],
  b00245: ['甲硫咪唑/他巴唑 MMI','丙硫氧嘧啶 PTU','中性粒细胞','禁用阿司匹林'],
  b00246: ['首选全切、近全切','患侧叶或部分切+冰冻切片','<1 和五个无'],
  b00248: ['血钙','PTH','超声最常用、核素最准确'],
  b00250: ['导管上皮非典型/异型增生','乳头凹陷','橘皮样变','Cooper/乳房悬韧带'],
  b00252: ['最易血性溢液','切除病变乳管+常规病检','切除肿瘤+常规病检'],
  b00254: ['压缩量<20%','纵隔扑动','威胁最大→立即穿刺抽气','第 4-7 肋'],
  b00262: ['手术同时抗休克','门管三联入肝血流阻断法','肝十二指肠韧带'],
  b00264: ['腹腔穿刺','严重腹胀','中晚期妊娠','肾损伤首选 CT','反复冲腹腔'],
  b00266: ['经腹股沟管内口','经海氏/Hesselbach 三角','最易嵌顿'],
  b00269: ['痛、吐、胀、停','弹簧或杯口状','马蹄状巨大双腔充气肠袢','闭袢性梗阻'],
  b00270: ['转移性右下腹痛','Psoas 征','Obturator 征','B 超→穿刺'],
  b00272: ['首选直肠指检','结肠镜','大便隐血试验','术前 2-3 天进流食'],
  b00274: ['持续性跳痛','骨盆直肠间隙脓肿'], // 删除本节原文中不存在的目标
  b00280: ['收缩压<90','EVL','TIPS','生长抑素/奥曲肽'],
  b00282: ['胆道梗阻（最主要）','寒战高热','三代头孢+甲硝唑','肝穿刺'],
  b00284: ['Mirizzi 征','≤3 天急诊 LC','>3 天急诊 PTGD','LC'],
  b00288: ['首选 B 超','最佳 MRCP','判断胆管癌浸润深度','低信号充盈缺损'],
  b00289: ['胆总管扩张 > 10mm','术后 2 周','术后 4 周','拔管太早会导致胆汁性腹膜炎'],
  b00297: ['进行性排尿困难','禁用 CCB','经尿道前列腺切除术 TURP','80ml 以上'],
  b00299: ['尿酸盐、胱氨酸','体外冲击波碎石 ESWL','经皮肾镜碎石取石 PCNL','肾盂切开取石']
};

function applyRecallMasks() {
  // 按最小语义块收集文字，而不是逐个 text node 扫描。
  // 这样“首选 <b>CTPA</b>”等被 HTML 标签拆开的答案也能被识别。
  const blockSelector = 'p, td, th, li, h1, h2, h3, h4, blockquote';
  const walker = document.createTreeWalker(els.content, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue ||
          node.parentElement.closest('script, style, .recall-mask')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const groups = new Map();
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const block = node.parentElement.closest(blockSelector) || node.parentElement;
    if (!groups.has(block)) groups.set(block, []);
    groups.get(block).push(node);
  }

  // 每条规则都只遮答案片段，尽可能保留临床线索和解释。
  // 规则覆盖诊断、检查、阈值、分型、机制、治疗、禁忌及并发症等知识点。
  const cueRules = [
    // 只遮住明确提示词后面的短答案；不再把整段解释性文字一并遮住。
    /(首选|金标准|确诊检查|最佳检查|最有价值(?:的体征|的检查)?|最敏感(?:的指标|的检查)?|最特异(?:的指标|的检查)?|最常见(?:的并发症|的原因|的病原体)?|典型表现|禁忌(?:证)?|禁用|急救处理|诊断标准|确诊依据|首选药物|首选治疗|首选检查)[：:\s-]{0,8}([^，。；;、！？\n]{2,14})/g,
    /(妊娠[^，。；;]{0,12}首选|并发[^，。；;]{0,12}首选|合并[^，。；;]{0,10}首选)[：:\s-]{0,5}([^，。；;、！？\n]{2,14})/g,
    // 结构化知识点：保留提问线索，只遮其后最短的核心答案；仅匹配明确冒号，避免整段遮挡。
    /(病因|诱因|危险因素|高危因素|发病机制|主要机制|病理特点|病理改变|临床表现|典型症状|特征性表现|特征性体征|并发症|术后并发症|治疗原则|治疗方法|治疗药物|处理原则|急诊处理|手术方式|手术指征|适应证|禁忌证|鉴别要点|鉴别诊断|实验室特点|实验室检查|辅助检查|影像学表现|X线表现|CT表现|MRI表现|超声表现|心电图表现|血气特点|病原学检查|病原体|传播途径|好发部位|好发人群|好发年龄|诊断依据|诊断要点|诊断金标准|确诊方法|阳性提示|阴性排除|分期标准|临床分期|分期|分型|分级|预后因素|复查指标|首选药物|首选检查|首选治疗)[：:]\s*([^，。；;、！？\n]{2,30})/g,
    // 阈值只遮数字/界值，保留指标名称，避免整条诊断标准变成空白。
    /((?:FEV.?1\s*\/\s*FVC|FEV.?1|PaO.?2|PaCO.?2|SaO.?2|pH|血压|收缩压|舒张压|血肌酐|血钾|血钠|血钙|白细胞|血小板|血红蛋白|尿蛋白|eGFR|LVEF|PCWP|CI|ABI|D-二聚体|体温|呼吸频率|心率|年龄|直径|面积|出血量|氧流量)[^，。；;、！？\n]{0,8})((?:≥|≤|>|<|大于|小于|高于|低于)\s?\d+(?:\.\d+)?(?:%|次\/分|mmHg|mmol\/L|mg\/dL|L\/分|cm|mm)?)/gi
  ];

  const foundTargets = new Set();
  let maskedCount = 0;
  const toMask = [];

  const chapterHeadings = [...els.content.querySelectorAll('[id]')]
    .filter((heading) => Object.prototype.hasOwnProperty.call(CHAPTER_TARGETS, heading.id));
  const chapterIdForBlock = (block) => {
    let activeId = null;
    for (const heading of chapterHeadings) {
      if (heading === block || (heading.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING)) {
        activeId = heading.id;
      } else {
        break;
      }
    }
    return activeId;
  };

  for (const [block, nodes] of groups) {
    const chapterId = chapterIdForBlock(block);
    const activeTargets = [...new Set([...RECALL_TARGETS, ...(CHAPTER_TARGETS[chapterId] || [])])];
    // 映射拼接后的字符偏移到原始 DOM text node，支持跨 <b>/<sub>/<sup>。
    let joined = '';
    const segments = [];
    for (const node of nodes) {
      const value = node.nodeValue || '';
      const startOffset = joined.length;
      joined += value;
      segments.push({ node, start: startOffset, end: joined.length });
    }
    if (!joined) continue;

    const matches = [];
    for (const target of activeTargets) {
      // 超长目标本身往往是整句，不作为一个遮挡块；维持细颗粒度。
      if (target.length > 28) continue;
      // “剧烈”只在 COPD 呼吸困难分级的固定语境中遮挡，避免把全文其他无关用法一并遮住。
      if (target === '剧烈' &&
          !/(剧烈活动时出现呼吸困难|剧烈、快步、爬坡)/.test(joined)) continue;
      let from = 0;
      while (from <= joined.length - target.length) {
        const pos = joined.indexOf(target, from);
        if (pos < 0) break;
        matches.push({ start: pos, end: pos + target.length, text: joined.slice(pos, pos + target.length), target });
        from = pos + Math.max(1, target.length);
      }
    }
    for (const [ruleIndex, rule] of cueRules.entries()) {
      rule.lastIndex = 0;
      let match;
      while ((match = rule.exec(joined)) !== null) {
        const answer = match[2] || match[0];
        // 兜底限制单次自动遮挡长度，防止非 COPD 小节出现整句/整段空白。
        const maxAnswerLength = ruleIndex === 2 ? 24 : 16;
        if (answer.trim().length > maxAnswerLength) continue;
        const answerOffset = match.index + match[0].lastIndexOf(answer);
        if (answer.trim().length >= 2) {
          matches.push({ start: answerOffset, end: answerOffset + answer.length, text: answer, target: null });
        }
        if (!match[0].length) rule.lastIndex++;
      }
    }

    matches.sort((a, b) => a.start - b.start || b.end - a.end);
    let lastEnd = -1;
    for (const match of matches) {
      if (match.start < lastEnd || match.end <= match.start) continue;
      const firstSegment = segments.find((segment) => match.start >= segment.start && match.start < segment.end);
      const lastSegment = [...segments].reverse().find((segment) => match.end > segment.start && match.end <= segment.end);
      if (!firstSegment || !lastSegment) continue;
      toMask.push({
        start: match.start,
        end: match.end,
        text: match.text,
        target: match.target,
        startNode: firstSegment.node,
        startLocal: match.start - firstSegment.start,
        endNode: lastSegment.node,
        endLocal: match.end - lastSegment.start
      });
      lastEnd = match.end;
    }
  }

  // 倒序替换，避免前面的 DOM 改动影响后续偏移；extractContents 保留原有内联标签。
  toMask.sort((a, b) => {
    const pos = a.startNode.compareDocumentPosition(b.startNode);
    if (a.startNode === b.startNode) return b.startLocal - a.startLocal;
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return 1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return -1;
    return b.start - a.start;
  });

  for (const match of toMask) {
    if (!match.startNode.isConnected || !match.endNode.isConnected) continue;
    const range = document.createRange();
    try {
      range.setStart(match.startNode, match.startLocal);
      range.setEnd(match.endNode, match.endLocal);
      const span = document.createElement('span');
      span.className = 'recall-mask';
      span.tabIndex = 0;
      span.setAttribute('role', 'button');
      span.setAttribute('aria-label', '内容已遮盖，点击查看');
      span.append(range.extractContents());
      range.insertNode(span);
      if (match.target) foundTargets.add(match.target);
      maskedCount++;
    } catch (error) {
      // 极少数跨复杂表格结构的范围跳过，避免破坏原文 DOM。
      console.debug('Recall mask skipped a complex range:', error);
    }
  }

  for (const target of RECALL_TARGETS) {
    if (!foundTargets.has(target)) console.debug('Recall mask target not found in a text block:', target);
  }
  console.info(`狂背自检：本次批量遮挡 ${maskedCount} 处内容。`);
}

function renderDocSwitcher() {
  els.docSwitch.innerHTML = DOCS.map((doc, i) => `
    <button class="doc-button" type="button" data-doc="${i}" aria-pressed="${i === state.docIndex}">
      ${escapeHTML(doc.name)}
    </button>`).join('');
}

function showLoadError(error) {
  console.error(error);
  els.stats.textContent = '文档载入失败';
  els.searchPanel.hidden = true;
  els.content.innerHTML = `
    <p class="load-error">正文或索引没有载入成功。
      <button class="retry-button" id="retryLoad" type="button">重新载入</button>
    </p>`;
  document.querySelector('#retryLoad').addEventListener('click', () => location.reload());
}

function renderStats() {
  const meta = state.index.meta;
  els.stats.textContent = `${meta.characters.toLocaleString('zh-CN')} 字符 · ${meta.blocks.toLocaleString('zh-CN')} 个段落 · ${meta.headings} 个章节。按 / 搜索，Enter 定位首条。`;
}

function renderOutline() {
  // count chapters under each level-1 subject first
  const counts = [];
  let current = -1;
  for (const item of state.index.outline) {
    if (item.level === 1) {
      counts.push(0);
      current += 1;
    } else if (current >= 0) {
      counts[current] += 1;
    }
  }

  let html = '';
  let groupOpen = false;
  let groupIndex = -1;

  for (const item of state.index.outline) {
    if (item.level === 1) {
      if (groupOpen) html += '</div>';
      groupIndex += 1;
      html += `
      <div class="outline-group">
        <button class="outline-h1" type="button" data-toggle-group data-section="${escapeAttr(item.section)}"
                aria-expanded="false" aria-label="展开 ${escapeAttr(item.title)} 的 ${counts[groupIndex]} 个章节">
          <span class="outline-h1-text">${escapeHTML(item.title)}</span>
          <span class="outline-count">${counts[groupIndex]} 章</span>
          <span class="outline-caret" aria-hidden="true">▸</span>
        </button>`;
      groupOpen = true;
    } else {
      html += `
        <a class="outline-h2" href="#${escapeAttr(item.id)}" data-target="${escapeAttr(item.id)}"
           data-section="${escapeAttr(item.section)}" hidden>
          ${escapeHTML(item.title)}
        </a>`;
    }
  }
  if (groupOpen) html += '</div>';
  els.outlineNav.innerHTML = html;
}

function setGroupExpanded(group, expanded) {
  const toggle = group.querySelector('[data-toggle-group]');
  toggle.setAttribute('aria-expanded', String(expanded));
  group.querySelectorAll('.outline-h2').forEach((link) => {
    link.hidden = !expanded;
  });
}

function expandSection(section) {
  const toggle = els.outlineNav.querySelector(`[data-toggle-group][data-section="${CSS.escape(section)}"]`);
  if (toggle) setGroupExpanded(toggle.closest('.outline-group'), true);
}

function bindEvents() {
  let searchTimer = 0;

  els.docSwitch.addEventListener('click', (event) => {
    const button = event.target.closest('.doc-button');
    if (!button) return;
    closeSidebar(false);
    switchDoc(Number(button.dataset.doc)).catch(showLoadError);
  });

  function toggleRecallMask(mask) {
    if (!mask || state.docIndex !== DOCS.findIndex((doc) => doc.key === 'recall')) return;
    const revealed = mask.classList.toggle('is-revealed');
    mask.setAttribute('aria-label', revealed ? '已显示内容，点击重新遮盖' : '内容已遮盖，点击查看');
  }
  els.content.addEventListener('click', (event) => {
    toggleRecallMask(event.target.closest('.recall-mask'));
  });
  els.content.addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key)) return;
    const mask = event.target.closest('.recall-mask');
    if (!mask) return;
    event.preventDefault();
    toggleRecallMask(mask);
  });

  els.search.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(runSearch, 100);
  });
  els.search.addEventListener('focus', () => {
    if (els.search.value.trim()) setSearchPanel(true);
  });
  els.search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      window.clearTimeout(searchTimer);
      runSearch();
      jumpToFirstResult();
    }
  });

  els.clear.addEventListener('click', () => {
    els.search.value = '';
    runSearch();
    clearHighlights();
    els.search.focus();
  });

  els.closeResults.addEventListener('click', () => setSearchPanel(false));

  document.addEventListener('pointerdown', (event) => {
    const insideSearch = event.target.closest('#searchShell, #searchPanel');
    const resultItem = event.target.closest('.result-item');
    if (!insideSearch && !resultItem && !els.searchPanel.hidden) setSearchPanel(false);
  });

  els.results.addEventListener('click', (event) => {
    const button = event.target.closest('.result-item');
    if (button) jumpToBlock(button.dataset.target);
  });

  els.outlineNav.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-toggle-group]');
    if (toggle) {
      const group = toggle.closest('.outline-group');
      const expanded = toggle.getAttribute('aria-expanded') !== 'true';
      setGroupExpanded(group, expanded);
      return;
    }
    const link = event.target.closest('a[data-target]');
    if (!link) return;
    event.preventDefault();
    closeSidebar(false);
    jumpToBlock(link.dataset.target);
  });

  els.sidebarToggle.addEventListener('click', openSidebar);
  els.sidebarClose.addEventListener('click', () => closeSidebar());
  els.drawerBackdrop.addEventListener('click', () => closeSidebar());
  mobileSidebar.addEventListener('change', syncSidebarMode);

  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && !isEditable(event.target)) {
      event.preventDefault();
      els.search.focus();
      if (els.search.value.trim()) setSearchPanel(true);
    }
    if (event.key === 'Escape') {
      if (!els.searchPanel.hidden) {
        setSearchPanel(false);
        els.search.focus();
      } else if (state.sidebarOpen) {
        closeSidebar();
      }
    }
  });

  els.backTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  });

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      updateBackTop();
      updateCurrentHeading();
      ticking = false;
    });
  }, { passive: true });

  updateBackTop();
}

function syncSidebarMode() {
  if (mobileSidebar.matches) {
    els.sidebarToggle.setAttribute('aria-expanded', String(state.sidebarOpen));
    if (state.sidebarOpen) {
      document.body.classList.add('sidebar-locked');
      els.sidebar.inert = false;
      els.sidebar.classList.add('is-open');
      els.drawerBackdrop.hidden = false;
      requestAnimationFrame(() => els.drawerBackdrop.classList.add('is-open'));
    } else {
      document.body.classList.remove('sidebar-locked');
      els.sidebar.inert = true;
      els.sidebar.classList.remove('is-open');
      els.drawerBackdrop.classList.remove('is-open');
      window.setTimeout(() => {
        if (!state.sidebarOpen) els.drawerBackdrop.hidden = true;
      }, reducedMotion ? 0 : 180);
    }
  } else {
    state.sidebarOpen = false;
    els.sidebar.inert = false;
    els.sidebar.classList.add('is-open');
    els.sidebar.classList.remove('sidebar-locked');
    els.drawerBackdrop.classList.remove('is-open');
    els.drawerBackdrop.hidden = true;
    document.body.classList.remove('sidebar-locked');
    els.sidebarToggle.setAttribute('aria-expanded', 'true');
  }
}

function openSidebar() {
  if (!mobileSidebar.matches) return;
  state.sidebarCloseFocus = document.activeElement;
  state.sidebarOpen = true;
  syncSidebarMode();
  els.sidebarClose.focus();
}

function closeSidebar(restoreFocus = true) {
  if (!mobileSidebar.matches) return;
  state.sidebarOpen = false;
  syncSidebarMode();
  if (restoreFocus && state.sidebarCloseFocus?.focus) state.sidebarCloseFocus.focus();
}

function setSearchPanel(open) {
  els.searchPanel.hidden = !open;
  els.searchPanel.setAttribute('aria-hidden', String(!open));
}

function runSearch() {
  const terms = parseQuery(els.search.value);
  clearHighlights();

  if (!terms.length) {
    state.matches = [];
    els.resultCount.textContent = '0';
    els.resultBadge.textContent = '';
    els.searchHelp.textContent = '输入关键词后显示匹配段落。';
    els.results.innerHTML = '';
    setSearchPanel(false);
    return;
  }

  const matches = [];
  for (const block of state.blocks) {
    if (state.section !== '全部' && block.s !== state.section) continue;
    const score = scoreBlock(block, terms);
    if (score !== null) matches.push({ ...block, score: score.score, first: score.first });
  }

  matches.sort((a, b) => b.score - a.score || a.first - b.first || a.id.localeCompare(b.id));
  state.matches = matches;

  const countText = matches.length.toLocaleString('zh-CN');
  els.resultCount.textContent = countText;
  els.resultBadge.textContent = countText;

  if (!matches.length) {
    els.searchHelp.textContent = `没有找到“${els.search.value.trim()}”。可以减少关键词，或切换资料范围。`;
    els.results.innerHTML = '';
    setSearchPanel(true);
    return;
  }

  els.searchHelp.textContent = matches.length > MAX_RENDERED_RESULTS
    ? `找到 ${countText} 条，下面显示最相关的前 ${MAX_RENDERED_RESULTS} 条。`
    : `找到 ${countText} 条，点击结果跳转到原文。`;

  const html = matches.slice(0, MAX_RENDERED_RESULTS).map((item) => {
    const type = item.k.startsWith('h') ? item.k.toUpperCase() : '段落';
    return `
      <button class="result-item" type="button" data-target="${escapeAttr(item.id)}">
        <span class="result-meta">${escapeHTML(item.s)} · ${type}</span>
        <span class="result-title">${highlightText(item.h, terms)}</span>
        <span class="result-snippet">${highlightText(makeSnippet(item.x, terms), terms)}</span>
      </button>`;
  }).join('');

  els.results.innerHTML = html + (matches.length > MAX_RENDERED_RESULTS
    ? `<div class="results-footer">继续输入更精确的关键词可缩小范围。</div>`
    : '');
  setSearchPanel(true);
}

function parseQuery(value) {
  const terms = [];
  let rest = value.trim();
  rest = rest.replace(/["“]([^"”]+)["”]/g, (_, phrase) => {
    const normalized = normalizeText(phrase);
    if (normalized) terms.push(normalized);
    return ' ';
  });
  for (const part of rest.split(/\s+/)) {
    const normalized = normalizeText(part);
    if (normalized) terms.push(normalized);
  }
  return [...new Set(terms)];
}

function scoreBlock(block, terms) {
  const text = normalizeText(block.x);
  const heading = normalizeText(block.h);
  const section = normalizeText(block.s);
  let first = Number.POSITIVE_INFINITY;
  let score = 0;

  for (const term of terms) {
    const textIndex = text.indexOf(term);
    const headingIndex = heading.indexOf(term);
    const sectionIndex = section.indexOf(term);
    if (textIndex < 0 && headingIndex < 0 && sectionIndex < 0) return null;

    const found = [textIndex, headingIndex, sectionIndex].filter((index) => index >= 0);
    first = Math.min(first, ...found);
    score += term.length * 4;
    if (headingIndex >= 0) score += 36;
    if (sectionIndex >= 0) score += 18;
  }

  if (block.k.startsWith('h')) score += 28;
  return { score, first };
}

function makeSnippet(text, terms) {
  const lower = normalizeText(text);
  const positions = terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0);
  const first = positions.length ? Math.min(...positions) : 0;
  const start = Math.max(0, first - 28);
  const end = Math.min(text.length, first + 110);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

function jumpToFirstResult() {
  const first = state.matches[0];
  if (first) jumpToBlock(first.id);
}

function jumpToBlock(id, options = {}) {
  const { updateHash = true } = options;
  const target = document.getElementById(id);
  if (!target) return;

  clearHighlights();
  window.clearTimeout(state.targetTimer);
  target.classList.add('is-target');
  highlightInElement(target, parseQuery(els.search.value));
  target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });

  if (updateHash) history.replaceState(null, '', `#${id}`);
  setSearchPanel(false);
  updateReaderContext(id);
  state.targetTimer = window.setTimeout(() => target.classList.remove('is-target'), 1800);
}

function highlightInElement(root, terms) {
  if (!terms.length) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      if (node.parentElement?.closest('mark, script, style')) return NodeFilter.FILTER_REJECT;
      const text = normalizeText(node.nodeValue);
      return terms.some((term) => text.includes(term)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => highlightTextNode(node, terms));
}

function highlightTextNode(textNode, terms) {
  const original = textNode.nodeValue;
  const lower = normalizeText(original);
  const fragment = document.createDocumentFragment();
  let cursor = 0;

  while (cursor < original.length) {
    let nearestIndex = -1;
    let nearestTerm = '';
    for (const term of terms) {
      const index = lower.indexOf(term, cursor);
      if (index >= 0 && (nearestIndex < 0 || index < nearestIndex || (index === nearestIndex && term.length > nearestTerm.length))) {
        nearestIndex = index;
        nearestTerm = term;
      }
    }
    if (nearestIndex < 0) {
      fragment.append(document.createTextNode(original.slice(cursor)));
      break;
    }
    if (nearestIndex > cursor) fragment.append(document.createTextNode(original.slice(cursor, nearestIndex)));
    const mark = document.createElement('mark');
    mark.className = 'search-hit';
    mark.textContent = original.slice(nearestIndex, nearestIndex + nearestTerm.length);
    fragment.append(mark);
    cursor = nearestIndex + nearestTerm.length;
  }

  textNode.replaceWith(fragment);
}

function clearHighlights() {
  els.content.querySelectorAll('.doc-block.is-target').forEach((block) => block.classList.remove('is-target'));
  els.content.querySelectorAll('mark.search-hit').forEach((mark) => {
    mark.replaceWith(document.createTextNode(mark.textContent));
  });
}

function highlightText(value, terms) {
  const lower = normalizeText(value);
  let cursor = 0;
  let html = '';

  while (cursor < value.length) {
    let nearestIndex = -1;
    let nearestTerm = '';
    for (const term of terms) {
      const index = lower.indexOf(term, cursor);
      if (index >= 0 && (nearestIndex < 0 || index < nearestIndex || (index === nearestIndex && term.length > nearestTerm.length))) {
        nearestIndex = index;
        nearestTerm = term;
      }
    }
    if (nearestIndex < 0) {
      html += escapeHTML(value.slice(cursor));
      break;
    }
    html += escapeHTML(value.slice(cursor, nearestIndex));
    const matchedText = value.slice(nearestIndex, nearestIndex + nearestTerm.length);
    html += `<mark class="search-hit">${escapeHTML(matchedText)}</mark>`;
    cursor = nearestIndex + nearestTerm.length;
  }

  return html;
}

function updateBackTop() {
  els.backTop.classList.toggle('is-visible', window.scrollY > 700);
}

function updateCurrentHeading() {
  const items = state.index?.outline || [];
  if (!items.length) return;

  let active = items[0];
  for (const item of items) {
    const target = document.getElementById(item.id);
    if (!target) continue;
    if (target.getBoundingClientRect().top <= window.innerHeight * 0.28) active = item;
    else break;
  }

  if (active.id !== state.activeOutlineId) {
    state.activeOutlineId = active.id;
    els.outlineNav.querySelectorAll('a[data-target]').forEach((link) => {
      link.setAttribute('aria-current', String(link.dataset.target === active.id));
    });
    els.currentSection.textContent = active.section;
    els.currentHeading.textContent = active.title;
  }
}

function updateReaderContext(id) {
  const target = document.getElementById(id);
  const items = state.index?.outline || [];
  if (!target || !items.length) return;

  let active = items[0];
  for (const item of items) {
    const heading = document.getElementById(item.id);
    if (!heading) continue;
    if (heading.getBoundingClientRect().top <= target.getBoundingClientRect().top + 1) active = item;
    else break;
  }

  state.activeOutlineId = active.id;
  els.currentSection.textContent = active.section;
  els.currentHeading.textContent = active.title;
  els.outlineNav.querySelectorAll('a[data-target]').forEach((link) => {
    link.setAttribute('aria-current', String(link.dataset.target === active.id));
  });
  expandSection(active.section);
}

function normalizeText(value) {
  return String(value || '').toLocaleLowerCase('zh-CN');
}

function escapeHTML(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHTML(value);
}

function isEditable(element) {
  return element instanceof HTMLElement && (
    element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.tagName === 'SELECT' ||
    element.isContentEditable
  );
}
