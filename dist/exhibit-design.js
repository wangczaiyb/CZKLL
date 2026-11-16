/* Display categories are derived. The original workbook kind is always retained. */
const EXHIBIT_DESIGN = {
  colors: {red: '#963D3D', background: '#F2EDE3', forest: '#697B69', boundary: '#B99A65', text: '#39322F', secondary: '#80776B'},
  categories: [
    {id: 'site', name: '遗址遗迹', color: '#76252D', chart: '#963D3D', symbol: '⌂'},
    {id: 'cemetery', name: '烈士陵园', color: '#B99A65', chart: '#B99A65', symbol: '▰'},
    {id: 'facility', name: '纪念设施/牌塔', color: '#80776B', chart: '#A08E75', symbol: '▥'},
    {id: 'museum', name: '展览场馆', color: '#8B7269', chart: '#8B7269', symbol: '▤'},
    {id: 'monument', name: '纪念塔纪念碑', color: '#697B69', chart: '#697B69', symbol: '▴'},
    {id: 'other', name: '其他及复合类别', color: '#9C9689', chart: '#9C9689', symbol: '···'}
  ],
  kindMap: {
    '遗址遗迹': 'site', '故居': 'site', '故居旧址': 'site', '旧居': 'site', '故居建筑（迁建）': 'site',
    '抗日义勇军成立地旧址': 'site', '会议遗址': 'site', '战斗遗址': 'site', '革命遗址': 'site', '遗址': 'site',
    '密营遗址': 'site', '抗联密营遗址群': 'site', '抗联会议旧址': 'site', '抗联仓库遗址': 'site', '抗联密营遗址': 'site',
    '中共南满省委机关旧址': 'site', '抗联一师师部/指挥部旧址': 'site', '抗联指挥部遗址': 'site', '抗联战斗遗址': 'site',
    '抗日民主政权旧址': 'site', '烈士牺牲地': 'site', '会议旧址': 'site', '抗联遗址': 'site', '医院遗址': 'site',
    '司令部遗址': 'site', '战斗旧址': 'site', '会议出发地遗址': 'site', '机关旧址': 'site', '会议会址': 'site',
    '抗日群众组织旧址': 'site', '党支部旧址': 'site', '供给站遗址': 'site', '游击根据地遗址': 'site',
    '密营/宿营地遗址': 'site', '交通站遗址': 'site', '军需库遗址': 'site', '军马场遗址': 'site', '修械所遗址': 'site',
    '被服厂遗址': 'site', '抗日政权旧址': 'site', '密营/战斗遗址': 'site', '会师地遗址': 'site', '交通线遗址': 'site',
    '惨案遗址': 'site', '密营/交通站遗址': 'site', '旧址（抗日义勇军）': 'site', '密营': 'site',
    '密营（石屋式天然岩洞）': 'site', '红色政权旧址': 'site', '密营（师部）': 'site', '密营（后方医院/地窨子式）': 'site',
    '会议/活动遗址': 'site', '烈士牺牲地遗址': 'site', '联络点旧址': 'site', '联络点/隐蔽治疗所旧址': 'site',
    '暴动旧址': 'site', '隐蔽治疗所旧址': 'site', '遗址（古建筑）': 'site', '司令部旧址（抗日义勇军）': 'site',
    '烈士陵园': 'cemetery', '陵园': 'cemetery', '烈士墓': 'cemetery', '抗联烈士合葬墓': 'cemetery',
    '纪念设施/碑塔': 'facility', '纪念设施': 'facility', '纪念广场': 'facility',
    '展馆/陈列馆': 'museum', '展馆场馆': 'museum', '陈列馆': 'museum', '纪念馆': 'museum', '场馆': 'museum',
    '纪念塔纪念碑': 'monument', '纪念碑': 'monument', '纪念塔': 'monument',
    '纪念园': 'other', '抗联将领陵园/纪念碑': 'other', '遗址（纪念碑）': 'other', '石刻/纪念地标': 'other',
    '人物出生地': 'other', '石刻': 'other', '研学基地（红色教学基地）': 'other', '烈士就义纪念地': 'other', '战斗纪念地': 'other'
  },
  category(kind) {
    return this.categories.find(category => category.id === (this.kindMap[kind] || 'other'));
  }
};
window.EXHIBIT_DESIGN = EXHIBIT_DESIGN;
