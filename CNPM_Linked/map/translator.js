(() => {
  const normalize = (value) => String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/đ/g, "d").replace(/[^a-z0-9]+/g, " ").trim();
  let catalogPromise;
  async function getCatalog() {
    catalogPromise ||= fetch("/api/objects").then(async (response) => {
      if (!response.ok) throw new Error(`API địa điểm trả về HTTP ${response.status}`);
      const data = await response.json();
      return data.items || [];
    }).catch((error) => { catalogPromise = null; throw error; });
    return catalogPromise;
  }
  async function matchObject(place) {
    const catalog = await getCatalog();
    const candidates = [place.name, place.display_name, place.tags?.name, place.tags?.["name:vi"]]
      .map(normalize).filter(Boolean);
    return catalog.find((item) => {
      const name = normalize(item.name);
      return candidates.some((candidate) => candidate === name || candidate.startsWith(name + " ") || name.startsWith(candidate + " "));
    }) || null;
  }
  async function getAudio(place, target) {
    const item = await matchObject(place);
    if (!item) return null;
    const resultsResponse = await fetch(`/api/objects/${encodeURIComponent(item.id)}/results`);
    if (!resultsResponse.ok) throw new Error("Không đọc được danh sách bản dịch.");
    const resultsData = await resultsResponse.json();
    let result = (resultsData.items || []).find((entry) => entry.target_language === target);
    if (!result) {
      const form = new FormData();
      form.append("source", "vi");
      form.append("target", target);
      const processResponse = await fetch(`/api/objects/${encodeURIComponent(item.id)}/process`, { method: "POST", body: form });
      const data = await processResponse.json().catch(() => ({}));
      if (!processResponse.ok) throw new Error(data.detail || `Không tạo được bản dịch (HTTP ${processResponse.status}).`);
      result = data;
    }
    return { ...result, audio_url: result.audio_url || `/api/objects/${encodeURIComponent(item.id)}/results/${target}/speech.mp3` };
  }
  window.DocxTranslator = { getCatalog, matchObject, getAudio };
})();
