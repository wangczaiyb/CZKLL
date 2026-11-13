/* Reviewed image bindings use source-record identities while entity review continues. */
(() => {
  const registry = window.HERITAGE_IMAGE_REGISTRY;
  const failedAssets = new Set();
  let viewer;

  function get(record) {
    const binding = registry.bindings[record.id];
    if (binding?.status !== 'associated' || failedAssets.has(binding.asset_id)) return null;
    const asset = registry.assets[binding.asset_id];
    if (!asset) return null;
    const src = window.MUSEUM?.assets[binding.asset_id]
      || window.ARCHIVE_IMAGE_ASSETS?.[binding.asset_id]
      || asset.file;
    return {key: binding.asset_id, src, ...asset};
  }

  function apply(record) {
    const photo = get(record);
    return {
      ...record,
      image: photo?.key || null,
      imageSource: photo?.source || null,
      imageCaption: photo?.caption || null,
      imageStatus: registry.bindings[record.id]?.status || 'not_recorded'
    };
  }

  function removeFailedImage(image) {
    failedAssets.add(image.dataset.imageAsset);
    const record = image.closest('.ex-record');
    const detail = image.closest('.ex-detail');
    const article = image.closest('.full-detail');
    const wrapper = image.closest('.detail-visual,.detail-image,.photo-marker');
    record?.classList.add('text-only');
    article?.classList.add('text-only');
    if (detail) {
      detail.querySelectorAll('.detail-photo-controls,.photo-caption').forEach(element => element.remove());
      const compare = document.getElementById('compareToggle');
      if (compare) compare.hidden = true;
    }
    if (viewer?.contains(image)) viewer.close();
    if (wrapper) wrapper.remove();
    else image.remove();
  }

  function enlarge(record) {
    const photo = get(record);
    if (!photo) return;
    if (!viewer) {
      viewer = document.createElement('dialog');
      viewer.className = 'museum-dialog';
      viewer.id = 'heritageImageViewer';
      viewer.setAttribute('aria-label', '遗址资料影像');
      document.body.append(viewer);
      viewer.addEventListener('click', event => { if (event.target === viewer) viewer.close(); });
    }
    viewer.replaceChildren();
    const close = document.createElement('button');
    close.className = 'dialog-close';
    close.textContent = '×';
    close.setAttribute('aria-label', '关闭影像');
    close.addEventListener('click', () => viewer.close());
    const title = document.createElement('h2');
    title.textContent = record.name;
    const image = document.createElement('img');
    image.dataset.imageAsset = photo.key;
    image.src = photo.src;
    image.alt = photo.caption;
    image.style.cssText = 'display:block;max-width:100%;max-height:75vh;object-fit:contain;margin:auto';
    const caption = document.createElement('p');
    caption.textContent = photo.caption;
    const source = document.createElement('a');
    source.href = photo.source;
    source.target = '_blank';
    source.rel = 'noopener';
    source.textContent = photo.credit + ' · 图片来源 ↗';
    viewer.append(close, title, image, caption, source);
    if (!viewer.open) viewer.showModal();
  }

  document.addEventListener('error', event => {
    if (event.target instanceof HTMLImageElement && event.target.dataset.imageAsset) removeFailedImage(event.target);
  }, true);

  window.HeritageImages = {get, apply, enlarge};
})();
