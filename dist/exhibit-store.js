/* The source rows keep their identities, including entries present in both workbooks. */
class ExhibitStore {
  constructor(database) {
    this.database = database;
    this.records = database.records.map(record => ({...HeritageRecords.apply(record), displayCategory: EXHIBIT_DESIGN.category(record.kind).id}));
    this.byId = new Map(this.records.map(record => [record.id, record]));
    this.filters = {query: '', kind: '', city: '', category: '', status: '', mode: 'all'};
    this.searchText = new Map(this.records.map(record => {
      const routeNames = MUSEUM.routes.filter(route => record.routeIds.includes(route.id)).map(route => route.name);
      const text = [record.name, record.address, record.originalAddress, record.city, record.county, record.scopeName, record.kind, EXHIBIT_DESIGN.category(record.kind).name, record.searchBackground ?? record.background, ...record.people, ...routeNames].join(' ').normalize('NFKC').toLocaleLowerCase();
      return [record.id, text];
    }));
    this.page = 1;
    this.pageSize = 20;
    const requested = new URLSearchParams(location.search).get('site');
    this.selected = this.byId.has(requested) ? requested : this.records[0]?.id || null;
    this.page = Math.floor(this.records.findIndex(record => record.id === this.selected) / this.pageSize) + 1;
  }

  setFilter(key, value) {
    this.filters[key] = value;
    this.page = 1;
  }

  reset() {
    this.filters = {query: '', kind: '', city: '', category: '', status: '', mode: 'all'};
    this.page = 1;
  }

  matching({ignoreCategory = false, ignoreCity = false} = {}) {
    const {query, kind, city, category, status, mode} = this.filters;
    const words = query.normalize('NFKC').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return this.records.filter(record => {
      if (kind && record.kind !== kind) return false;
      if (!ignoreCity && city && record.city !== city) return false;
      if (!ignoreCategory && category && record.displayCategory !== category) return false;
      if (status === 'located' && record.longitude === null) return false;
      if (status === 'pending' && record.longitude !== null) return false;
      if (status === 'conflict' && !record.dataConflicts?.length) return false;
      const digitized = [true, '已数字化', 'completed'].includes(record.digitizationStatus);
      if (status === 'digitized' && !digitized) return false;
      if (status === 'unknownDigital' && record.digitizationStatus !== null) return false;
      if ((status === 'vr' || mode === 'vr') && !record.vrUrl) return false;
      if (mode === 'people' && !record.people.length) return false;
      if (mode === 'route' && !record.routeIds.length) return false;
      const text = this.searchText.get(record.id);
      return words.every(word => text.includes(word));
    });
  }

  reconcileSelection() {
    const records = this.matching();
    if (!records.some(record => record.id === this.selected)) this.selected = records[0]?.id || null;
    return records;
  }

  pointCollection(records = this.matching()) {
    return {
      type: 'FeatureCollection',
      features: records.filter(record => record.longitude !== null && record.latitude !== null).map(record => ({
        type: 'Feature',
        geometry: {type: 'Point', coordinates: [record.longitude, record.latitude]},
        properties: {id: record.id, name: record.name, vr: Boolean(record.vrUrl), category: record.displayCategory, color: EXHIBIT_DESIGN.category(record.kind).color}
      }))
    };
  }

  locationScope(record) {
    const boundaries = [...this.database.counties.features, ...this.database.cities.features];
    return boundaries.find(feature => feature.properties.adcode === record.scopeAdcode) || this.database.province.features[0];
  }
}

window.ExhibitStore = ExhibitStore;
