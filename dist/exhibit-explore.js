/* Relations are derived only from names present in the source rows. */
window.ExhibitExplore = class ExhibitExplore {
  constructor(store, actions) {
    this.store = store;
    this.actions = actions;
    document.getElementById('peopleGraph').addEventListener('click', () => this.people());
  }

  people() {
    const rows = this.store.matching();
    const people = [...new Set(rows.flatMap(record => record.people))];
    const entities = [...new Map(rows.filter(record => record.people.length).map(record => [record.siteId, record])).values()];
    this.actions.dialog('<h2>人物与遗址</h2><p>连线来自台账名称和历史简介中的人物关联。选择人物筛选相关档案，选择遗址打开数字档案。</p><div id="peopleGraphView"></div><div id="peopleGraphActions" class="graph-actions"></div>');
    const host = document.getElementById('peopleGraphView');
    if (!people.length) {
      host.textContent = '当前筛选尚无明确的人物关联，可重置筛选后继续探索。';
      return;
    }
    const visiblePeople = people.slice(0, 10);
    const visibleSites = entities.slice(0, 22);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 820 540');
    svg.setAttribute('aria-label', '台账人物与遗址关联网络');
    const positions = new Map();
    visiblePeople.forEach((name, index) => positions.set(name, [180, 35 + index * 470 / Math.max(1, visiblePeople.length - 1)]));
    visibleSites.forEach((record, index) => positions.set(record.id, [600, 20 + index * 500 / Math.max(1, visibleSites.length - 1)]));
    for (const record of visibleSites) for (const name of record.people) {
      if (!positions.has(name)) continue;
      const [x1,y1] = positions.get(name), [x2,y2] = positions.get(record.id);
      const line = document.createElementNS(svg.namespaceURI, 'path');
      line.setAttribute('d', `M${x1},${y1} C350,${y1} 430,${y2} ${x2},${y2}`);
      line.setAttribute('fill', 'none'); line.setAttribute('stroke', '#638d9c66');
      svg.append(line);
    }
    const node = (key, label, type, action) => {
      const [x,y] = positions.get(key);
      const group = document.createElementNS(svg.namespaceURI, 'g');
      group.setAttribute('role', 'button'); group.setAttribute('tabindex', '0'); group.setAttribute('aria-label', label);
      group.style.cursor = 'pointer';
      const circle = document.createElementNS(svg.namespaceURI, 'circle');
      circle.setAttribute('cx',x); circle.setAttribute('cy',y); circle.setAttribute('r',type==='person'?7:4);
      circle.setAttribute('fill',type==='person'?'#e7c98b':'#70c8d9');
      const text = document.createElementNS(svg.namespaceURI, 'text');
      text.setAttribute('x',type==='person'?x-15:x+12); text.setAttribute('y',y+4);
      text.setAttribute('text-anchor',type==='person'?'end':'start'); text.setAttribute('fill','#dbe3e9');
      text.setAttribute('font-size',type==='person'?15:11);
      text.textContent = label.length>17 ? label.slice(0,17)+'…' : label;
      const title = document.createElementNS(svg.namespaceURI, 'title'); title.textContent = label;
      group.append(circle,text,title); group.addEventListener('click',action);
      group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();action();}});
      svg.append(group);
    };
    for (const name of visiblePeople) node(name,name,'person',()=>{this.actions.search(name);document.getElementById('exDialog').close();});
    for (const record of visibleSites) node(record.id,record.name,'site',()=>{this.actions.select(record.id,true);document.getElementById('exDialog').close();});
    host.append(svg);
    const actions = document.getElementById('peopleGraphActions');
    for (const name of people) {
      const button = document.createElement('button'); button.className = 'detail-vr';
      button.textContent = `${name} · ${rows.filter(record=>record.people.includes(name)).length} 条来源记录`;
      button.addEventListener('click',()=>{this.actions.search(name);document.getElementById('exDialog').close();});
      actions.append(button);
    }
    const note = document.createElement('p'); note.className = 'data-source';
    note.textContent = `当前 ${people.length} 位关联人物、${entities.length} 个实体分组。网络显示前 ${visiblePeople.length} 位人物及前 ${visibleSites.length} 个遗址分组，完整档案可通过人物筛选查看。`;
    host.append(note);
  }
};
