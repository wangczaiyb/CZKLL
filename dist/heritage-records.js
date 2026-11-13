/* All entry points read the same reviewed overlay while retaining source fields. */
window.HeritageRecords = {
  apply(source) {
    const record = window.HeritageImages?.apply(source) || {...source};
    record.siteId = window.HERITAGE_ENTITIES?.bindings[record.id] || record.id;
    record.sourceRecordIds = window.HERITAGE_ENTITIES?.entities[record.siteId]?.source_record_ids || [record.id];
    record.geographyCandidate = window.GEOGRAPHY_CANDIDATES?.records[record.id] || null;
    const review = window.COORDINATE_REVIEWS?.[record.id];
    record.coordinateGrade = review?.grade || (record.geographyCandidate?.scope_adcode ? 'C' : 'D');
    const backgroundConflict = record.dataConflicts?.some(conflict => conflict.conflictingFields?.includes('background'));
    record.searchBackground = backgroundConflict ? '' : record.background;
    if (backgroundConflict) record.people = (record.people || []).filter(name => record.name.includes(name));
    record.coordinateReview = review || null;
    if (review) {
      record.sourceLongitude = record.longitude;
      record.sourceLatitude = record.latitude;
      record.coordinatePrecision = review.position_type;
      record.coordinateStatus = review.grade + '级 · ' + review.reason;
      if (review.address) record.address = review.address;
      if (review.grade === 'C' || review.grade === 'D') {
        record.longitude = null;
        record.latitude = null;
      }
    }
    return record;
  }
};
