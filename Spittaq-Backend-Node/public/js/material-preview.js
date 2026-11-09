(() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[char]);

  function getDialog() {
    let dialog = document.querySelector('#materialPreviewDialog');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'materialPreviewDialog';
    dialog.className = 'material-preview-dialog';
    dialog.innerHTML = '<div class="material-preview-header"><div><strong id="materialPreviewTitle"></strong><small id="materialPreviewFile"></small></div><button type="button" id="closeMaterialPreview" aria-label="Tutup pratinjau">×</button></div><div class="material-preview-body" id="materialPreviewBody"></div>';
    document.body.append(dialog);
    dialog.querySelector('#closeMaterialPreview').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => { dialog.querySelector('#materialPreviewBody').replaceChildren(); });
    return dialog;
  }

  async function readZipEntry(buffer, wantedName) {
    const view = new DataView(buffer);
    let eocd = -1;
    for (let i = view.byteLength - 22; i >= Math.max(0, view.byteLength - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Format berkas Office tidak dikenali.');
    const entries = view.getUint16(eocd + 10, true);
    let offset = view.getUint32(eocd + 16, true);
    for (let index = 0; index < entries; index++) {
      if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('Isi berkas Office tidak terbaca.');
      const method = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);
      const name = new TextDecoder().decode(new Uint8Array(buffer, offset + 46, nameLength));
      if (name === wantedName) {
        const localNameLength = view.getUint16(localOffset + 26, true);
        const localExtraLength = view.getUint16(localOffset + 28, true);
        const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
        const compressed = new Uint8Array(buffer, dataOffset, compressedSize);
        if (method === 0) return new TextDecoder().decode(compressed);
        if (method !== 8 || typeof DecompressionStream === 'undefined') throw new Error('Browser ini belum mendukung pratinjau berkas Office.');
        const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new TextDecoder().decode(await new Response(stream).arrayBuffer());
      }
      offset += 46 + nameLength + extraLength + commentLength;
    }
    throw new Error('Konten pratinjau tidak ditemukan di dalam berkas.');
  }

  function appendParagraphs(container, text, paragraphName, textName) {
    const xml = new DOMParser().parseFromString(text, 'application/xml');
    if (xml.querySelector('parsererror')) throw new Error('Isi dokumen tidak dapat dibaca.');
    const paragraphs = [...xml.getElementsByTagNameNS('*', paragraphName)];
    paragraphs.forEach(source => {
      const value = [...source.getElementsByTagNameNS('*', textName)].map(node => node.textContent).join('');
      if (!value.trim()) return;
      const paragraph = document.createElement('p');
      paragraph.textContent = value;
      container.append(paragraph);
    });
    return paragraphs.length;
  }

  async function previewOffice(url, extension, body) {
    if (extension === '.doc' || extension === '.ppt') {
      throw new Error('Berkas format lama .doc/.ppt belum mendukung pratinjau. Minta guru mengunggah ulang dalam format PDF atau DOCX/PPTX.');
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error('Berkas materi tidak dapat dimuat.');
    const buffer = await response.arrayBuffer();
    const page = document.createElement('article');
    page.className = 'office-preview-page';
    if (extension === '.docx') {
      const xml = await readZipEntry(buffer, 'word/document.xml');
      appendParagraphs(page, xml, 'p', 't');
      if (!page.childElementCount) page.textContent = 'Dokumen ini belum memiliki teks yang bisa ditampilkan.';
    } else {
      const view = new DataView(buffer);
      let eocd = -1;
      for (let i = view.byteLength - 22; i >= Math.max(0, view.byteLength - 65557); i--) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
      if (eocd < 0) throw new Error('Format presentasi tidak dikenali.');
      const entries = view.getUint16(eocd + 10, true);
      let offset = view.getUint32(eocd + 16, true);
      const slideNames = [];
      for (let index = 0; index < entries; index++) {
        const nameLength = view.getUint16(offset + 28, true);
        const extraLength = view.getUint16(offset + 30, true);
        const commentLength = view.getUint16(offset + 32, true);
        const name = new TextDecoder().decode(new Uint8Array(buffer, offset + 46, nameLength));
        if (/^ppt\/slides\/slide\d+\.xml$/.test(name)) slideNames.push(name);
        offset += 46 + nameLength + extraLength + commentLength;
      }
      slideNames.sort((a,b) => Number(a.match(/slide(\d+)/)[1]) - Number(b.match(/slide(\d+)/)[1]));
      for (const [index, name] of slideNames.entries()) {
        const slideXml = await readZipEntry(buffer, name);
        const slide = document.createElement('section');
        slide.className = 'office-slide';
        const label = document.createElement('strong');
        label.textContent = `Slide ${index + 1}`;
        slide.append(label);
        appendParagraphs(slide, slideXml, 'p', 't');
        page.append(slide);
      }
      if (!slideNames.length) throw new Error('Slide presentasi tidak ditemukan.');
    }
    body.append(page);
  }

  window.loadMaterialSnippet = async (url, fileName) => {
    const extension = String(fileName || '').split('.').pop().toLowerCase();
    if (!['docx','pptx'].includes(extension)) return '';
    const response = await fetch(url);
    if (!response.ok) throw new Error('Berkas tidak dapat dibaca.');
    const buffer = await response.arrayBuffer();
    let xmlText = '';
    if (extension === 'docx') {
      xmlText = await readZipEntry(buffer, 'word/document.xml');
    } else {
      const view = new DataView(buffer);
      let eocd = -1;
      for (let i = view.byteLength - 22; i >= Math.max(0, view.byteLength - 65557); i--) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
      if (eocd < 0) throw new Error('Presentasi tidak dikenali.');
      const entries = view.getUint16(eocd + 10, true);
      let offset = view.getUint32(eocd + 16, true);
      const slides = [];
      for (let index = 0; index < entries; index++) {
        const nameLength = view.getUint16(offset + 28, true), extraLength = view.getUint16(offset + 30, true), commentLength = view.getUint16(offset + 32, true);
        const name = new TextDecoder().decode(new Uint8Array(buffer, offset + 46, nameLength));
        if (/^ppt\/slides\/slide\d+\.xml$/.test(name)) slides.push(name);
        offset += 46 + nameLength + extraLength + commentLength;
      }
      slides.sort((a,b) => Number(a.match(/slide(\d+)/)[1]) - Number(b.match(/slide(\d+)/)[1]));
      if (!slides.length) return '';
      xmlText = await readZipEntry(buffer, slides[0]);
    }
    const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
    return [...xml.getElementsByTagNameNS('*','p')].map(paragraph => [...paragraph.getElementsByTagNameNS('*','t')].map(node => node.textContent).join('')).filter(text => text.trim()).slice(0,3).join(' · ').slice(0,180);
  };

  window.openMaterialPreview = async material => {
    const dialog = getDialog();
    const body = dialog.querySelector('#materialPreviewBody');
    const extension = String(material.fileName || '').split('.').pop().toLowerCase();
    dialog.querySelector('#materialPreviewTitle').textContent = material.title || 'Pratinjau materi';
    dialog.querySelector('#materialPreviewFile').textContent = material.fileName || '';
    body.innerHTML = '<p class="preview-loading">Memuat pratinjau...</p>';
    if (!dialog.open) dialog.showModal();
    try {
      if (extension === 'pdf') {
        const frame = document.createElement('iframe');
        frame.className = 'pdf-preview-frame';
        frame.src = material.url;
        frame.title = `Pratinjau ${material.title || material.fileName}`;
        body.replaceChildren(frame);
      } else if (['jpg','jpeg','png'].includes(extension)) {
        const image = document.createElement('img');
        image.className = 'image-preview';
        image.src = material.url;
        image.alt = material.title || material.fileName;
        body.replaceChildren(image);
      } else {
        body.replaceChildren();
        await previewOffice(material.url, `.${extension}`, body);
      }
    } catch (error) {
      body.innerHTML = `<p class="preview-error">${escape(error.message)}<br><a href="${escape(material.url)}">Unduh berkas</a></p>`;
    }
  };
})();
