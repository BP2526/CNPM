// 1. Khởi tạo bản đồ và đặt vị trí trung tâm mặc định (Ví dụ: TP.HCM)
const map = L.map("map").setView([10.762622, 106.660172], 13);

// 2. Thêm lớp bản đồ
L.tileLayer("https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", {
  maxZoom: 19,
  attribution: "© Google Maps",
}).addTo(map);

// Biến lưu trữ ghim vị trí (marker) để quản lý
let currentMarker = null;
let selectedPlaceMarker = null;
let currentLocationCircle = null;
let searchRadiusMeters = 1000;

// Lớp chứa các ghim địa điểm xung quanh
const poiLayer = L.layerGroup().addTo(map);
const selectedPlaceLayer = L.layerGroup().addTo(map);

function capNhatVungViTri(latlng) {
  if (!currentLocationCircle) {
    currentLocationCircle = L.circle(latlng, {
      radius: searchRadiusMeters,
      color: "#2563eb",
      fillColor: "#3b82f6",
      fillOpacity: 0.12,
      weight: 2,
    }).addTo(map);
    return;
  }

  currentLocationCircle.setLatLng(latlng);
  currentLocationCircle.setRadius(searchRadiusMeters);
}

// Các phần tử giao diện
const searchInput = document.getElementById("search-input");
const searchResults = document.getElementById("search-results");
const statusEl = document.getElementById("status");
const radiusSlider = document.getElementById("radius-slider");
const radiusValue = document.getElementById("radius-value");
let searchController = null;
let searchRequestId = 0;
let locationRequestId = 0;
let searchDebounceTimer = null;
let activeSearchResultIndex = -1;
let currentSpeech = null;

radiusSlider.addEventListener("input", () => {
  searchRadiusMeters = Number(radiusSlider.value) * 1000;
  radiusValue.value = `${radiusSlider.value} km`;
  currentLocationCircle?.setRadius(searchRadiusMeters);
});

radiusSlider.addEventListener("change", () => {
  const activeChip = document.querySelector(".chip.active");
  if (activeChip) {
    timDiaDiemXungQuanh(activeChip.getAttribute("data-cat"));
  } else {
    setStatus(`Bán kính tìm kiếm: ${radiusSlider.value} km.`);
  }
});

function datTrangThaiGiongNoi(isPlaying) {
  if (!currentSpeech) return;
  if (currentSpeech.playButton.isConnected) {
    currentSpeech.playButton.textContent = isPlaying
      ? "⏸ Tạm dừng"
      : "▶ Phát giới thiệu";
    currentSpeech.playButton.classList.toggle("playing", isPlaying);
    currentSpeech.playButton.setAttribute("aria-pressed", String(isPlaying));
  }
}

function dungGioiThieuDiaDiem() {
  if (!currentSpeech) return;
  const speech = currentSpeech;
  currentSpeech = null;
  window.speechSynthesis?.cancel();
  if (speech.audio) { speech.audio.pause(); speech.audio.currentTime = 0; }
  if (speech.playButton.isConnected) {
    speech.playButton.textContent = "▶ Phát giới thiệu";
    speech.playButton.classList.remove("playing");
    speech.playButton.setAttribute("aria-pressed", "false");
  }
  if (speech.stopButton.isConnected) speech.stopButton.disabled = true;
  if (speech.status.isConnected) speech.status.textContent = "";
}

// Danh sách máy chủ Overpass (thử lần lượt nếu máy chủ đầu bị quá tải)
const OVERPASS_SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

// Dùng để hủy yêu cầu cũ khi có yêu cầu mới
let poiController = null;
let poiSearchCache = {
  centerKey: null,
  category: null,
  searchedRadiusMeters: 0,
  places: new Map(),
  source: null,
};

function xoaBoNhoDiaDiem() {
  if (currentSpeech) dungGioiThieuDiaDiem();
  if (poiController) poiController.abort();
  poiController = null;
  poiLayer.clearLayers();
  poiSearchCache = {
    centerKey: null,
    category: null,
    searchedRadiusMeters: 0,
    places: new Map(),
    source: null,
  };
}

function capNhatGhimTheoBanKinh(radiusInMeters) {
  let visibleCount = 0;

  poiSearchCache.places.forEach((place) => {
    if (place.distance <= radiusInMeters) {
      if (!poiLayer.hasLayer(place.marker)) place.marker.addTo(poiLayer);
      visibleCount++;
    } else if (poiLayer.hasLayer(place.marker)) {
      poiLayer.removeLayer(place.marker);
    }
  });

  return visibleCount;
}

// ==========================================
// HIỂN THỊ TRẠNG THÁI CHO NGƯỜI DÙNG
// ==========================================
function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
}

function escapeHTML(str = "") {
  return str.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

function dinhDangKhoangCach(distance) {
  return distance < 1000
    ? `${Math.round(distance)} m`
    : `${(distance / 1000).toFixed(1).replace(".", ",")} km`;
}

function tenLoaiDiaDiem(place) {
  const key = place.categoryKey || place.tags?.amenity || "";
  const value = place.categoryValue || place.tags?.[key] || "";
  const labels = {
    hospital: "Bệnh viện",
    pharmacy: "Nhà thuốc",
    chemist: "Nhà thuốc",
    supermarket: "Siêu thị",
    convenience: "Cửa hàng tiện lợi",
    department_store: "Cửa hàng bách hóa",
    cafe: "Quán cà phê",
    fast_food: "Quán ăn nhanh",
    cinema: "Rạp chiếu phim",
    park: "Công viên",
    restaurant: "Nhà hàng",
    doctors: "Phòng khám",
    clinic: "Phòng khám",
    school: "Trường học",
    university: "Trường đại học",
    hotel: "Khách sạn",
    library: "Thư viện",
    bank: "Ngân hàng",
    fuel: "Trạm xăng",
  };

  if (labels[value]) return labels[value];
  return place.categoryLabel || place.typeLabel || "Địa điểm";
}

function noiDungGioiThieuDiaDiem(place, distance) {
  const parts = [`${place.name}.`, `${tenLoaiDiaDiem(place)}.`];
  if (place.display_name && place.display_name !== place.name) {
    parts.push(`Địa chỉ: ${place.display_name}.`);
  }
  if (Number.isFinite(distance)) {
    parts.push(`Cách vị trí của bạn ${dinhDangKhoangCach(distance)}.`);
  }
  if (place.description) parts.push(place.description);
  if (place.openingHours) {
    parts.push(`Giờ mở cửa: ${place.openingHours}.`);
  }
  return parts.join(" ");
}

function taoTheThongTinDiaDiem(place, distance) {
  const card = document.createElement("section");
  card.className = "place-card";

  const heading = document.createElement("h3");
  heading.className = "place-name";
  heading.textContent = place.name || "Địa điểm";
  card.appendChild(heading);

  const category = document.createElement("p");
  category.className = "place-meta place-category";
  category.textContent = tenLoaiDiaDiem(place);
  card.appendChild(category);

  if (place.display_name) {
    const address = document.createElement("p");
    address.className = "place-meta";
    address.textContent = place.display_name;
    card.appendChild(address);
  }

  if (Number.isFinite(distance)) {
    const distanceEl = document.createElement("p");
    distanceEl.className = "place-meta";
    distanceEl.textContent = `Cách bạn khoảng ${dinhDangKhoangCach(distance)}`;
    card.appendChild(distanceEl);
  }

  if (place.openingHours) {
    const hours = document.createElement("p");
    hours.className = "place-meta";
    hours.textContent = `Giờ mở cửa: ${place.openingHours}`;
    card.appendChild(hours);
  }
  if (place.phone) {
    const phone = document.createElement("p");
    phone.className = "place-meta";
    phone.textContent = `Điện thoại: ${place.phone}`;
    card.appendChild(phone);
  }
  if (place.website) {
    const website = document.createElement("a");
    website.className = "place-meta place-website";
    website.textContent = "Trang web";
    website.href = place.website.startsWith("http")
      ? place.website
      : `https://${place.website}`;
    website.target = "_blank";
    website.rel = "noopener noreferrer";
    card.appendChild(website);
  }

  const narrationControls = document.createElement("div");
  narrationControls.className = "narration-controls";
  const languageLabel = document.createElement("label");
  languageLabel.textContent = "Ngôn ngữ thuyết minh: ";
  const languageSelect = document.createElement("select");
  languageSelect.className = "narration-language";
  languageSelect.setAttribute("aria-label", "Chọn ngôn ngữ thuyết minh");
  for (const [code, label] of [["en", "English"], ["zh", "中文"], ["vi", "Tiếng Việt"]]) {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = label;
    languageSelect.appendChild(option);
  }
  languageLabel.appendChild(languageSelect);
  narrationControls.appendChild(languageLabel);
  card.appendChild(narrationControls);

  const actions = document.createElement("div");
  actions.className = "place-actions";

  const playButton = document.createElement("button");
  playButton.className = "btn-listen";
  playButton.type = "button";
  playButton.textContent = "▶ Phát giới thiệu";
  playButton.setAttribute("aria-pressed", "false");

  const stopButton = document.createElement("button");
  stopButton.className = "btn-audio-stop";
  stopButton.type = "button";
  stopButton.textContent = "■ Dừng";
  stopButton.disabled = true;

  const routeLink = document.createElement("a");
  routeLink.className = "btn-route";
  routeLink.textContent = "Chỉ đường";
  routeLink.href = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lon}`;
  routeLink.target = "_blank";
  routeLink.rel = "noopener noreferrer";
  actions.append(playButton, stopButton, routeLink);
  card.appendChild(actions);

  const audioStatus = document.createElement("p");
  audioStatus.className = "place-audio-status";
  audioStatus.setAttribute("aria-live", "polite");
  card.appendChild(audioStatus);

  playButton.addEventListener("click", async () => {
    if (currentSpeech?.playButton === playButton) {
      if (currentSpeech.audio) {
        if (currentSpeech.audio.paused) {
          try {
            await currentSpeech.audio.play();
            datTrangThaiGiongNoi(true);
            audioStatus.textContent = "Đang phát thuyết minh.";
          } catch (error) {
            audioStatus.textContent = `Không phát được âm thanh: ${error.message}`;
          }
        } else {
          currentSpeech.audio.pause();
          datTrangThaiGiongNoi(false);
          audioStatus.textContent = "Đã tạm dừng.";
        }
      } else if (window.speechSynthesis?.paused) {
        window.speechSynthesis.resume();
        datTrangThaiGiongNoi(true);
        audioStatus.textContent = "Đang phát giới thiệu địa điểm.";
      } else {
        window.speechSynthesis?.pause();
        datTrangThaiGiongNoi(false);
        audioStatus.textContent = "Đã tạm dừng.";
      }
      return;
    }

    dungGioiThieuDiaDiem();
    playButton.disabled = true;
    audioStatus.textContent = "Đang tìm thuyết minh...";
    try {
      const targetLanguage = languageSelect.value;
      const narration = await window.DocxTranslator.getAudio(place, targetLanguage);
      if (narration) {
        const audio = new Audio(narration.audio_url);
        currentSpeech = { audio, playButton, stopButton, status: audioStatus, marker: place.marker || null };
        audio.onended = () => {
          if (currentSpeech?.audio !== audio) return;
          dungGioiThieuDiaDiem();
        };
        audio.onerror = () => {
          if (currentSpeech?.audio !== audio) return;
          dungGioiThieuDiaDiem();
          audioStatus.textContent = "Không tải được MP3 thuyết minh.";
        };
        stopButton.disabled = false;
        playButton.textContent = "⏸ Tạm dừng";
        playButton.classList.add("playing");
        playButton.setAttribute("aria-pressed", "true");
        audioStatus.textContent = `Đang phát thuyết minh (${targetLanguage.toUpperCase()}).`;
        await audio.play();
        return;
      }

      if (targetLanguage !== "vi") {
        audioStatus.textContent = "Chưa có thuyết minh cho địa điểm này. Hãy thử một địa điểm trong danh sách nổi bật.";
        return;
      }
      if (!("speechSynthesis" in window)) {
        audioStatus.textContent = "Giọng đọc không được trình duyệt này hỗ trợ.";
        return;
      }
      const utterance = new SpeechSynthesisUtterance(noiDungGioiThieuDiaDiem(place, distance));
      utterance.lang = "vi-VN";
      utterance.rate = 0.95;
      utterance.pitch = 1;
      const vietnameseVoice = window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith("vi"));
      if (vietnameseVoice) utterance.voice = vietnameseVoice;
      currentSpeech = { utterance, playButton, stopButton, status: audioStatus, marker: place.marker || null };
      stopButton.disabled = false;
      playButton.textContent = "⏸ Tạm dừng";
      playButton.classList.add("playing");
      playButton.setAttribute("aria-pressed", "true");
      audioStatus.textContent = "Đang phát giới thiệu địa điểm bằng giọng đọc trình duyệt.";
      utterance.onend = () => { if (currentSpeech?.utterance === utterance) dungGioiThieuDiaDiem(); };
      utterance.onerror = () => { if (currentSpeech?.utterance === utterance) { dungGioiThieuDiaDiem(); audioStatus.textContent = "Không phát được giọng đọc."; } };
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      if (currentSpeech?.playButton === playButton) dungGioiThieuDiaDiem();
      audioStatus.textContent = `Không tải được thuyết minh: ${error.message}`;
    } finally {
      playButton.disabled = false;
    }
  });

  stopButton.addEventListener("click", dungGioiThieuDiaDiem);
  return card;
}

function ganTheThongTin(marker, place, distance) {
  place.lat ??= marker.getLatLng().lat;
  place.lon ??= marker.getLatLng().lng;
  place.marker = marker;
  marker.bindPopup(() => taoTheThongTinDiaDiem(place, distance), {
    maxWidth: 340,
    minWidth: 260,
  });
  marker.on("popupclose", () => {
    if (currentSpeech?.marker === marker) dungGioiThieuDiaDiem();
  });
}

function chonViTri(latlng, label, place = null) {
  xoaBoNhoDiaDiem();
  if (currentMarker) map.removeLayer(currentMarker);

  capNhatVungViTri(latlng);
  currentMarker = L.marker(latlng).addTo(map);
  if (place) {
    ganTheThongTin(currentMarker, place, place.distance);
  } else {
    currentMarker.bindPopup(escapeHTML(label));
  }
  currentMarker.openPopup();

  const activeChip = document.querySelector(".chip.active");
  if (activeChip) {
    timDiaDiemXungQuanh(activeChip.getAttribute("data-cat"));
  }
}

// ==========================================
// XỬ LÝ LẤY VỊ TRÍ HIỆN TẠI (GPS)
// ==========================================
const btnLocation = document.getElementById("btn-location");
btnLocation.addEventListener("click", function () {
  if ("geolocation" in navigator) {
    const requestId = ++locationRequestId;
    btnLocation.disabled = true;
    setStatus("Đang lấy vị trí của bạn...");
    navigator.geolocation.getCurrentPosition(
      function (position) {
        if (requestId !== locationRequestId) return;
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const latlng = [lat, lng];

        chonViTri(latlng, "Vị trí của bạn");
        setStatus("Đã lấy được vị trí. Hãy chọn loại địa điểm bên trên.");
        btnLocation.disabled = false;
      },
      function (error) {
        if (requestId !== locationRequestId) return;
        btnLocation.disabled = false;
        const messages = {
          1: "Bạn chưa cho phép truy cập vị trí. Hãy bật quyền vị trí cho trang web rồi thử lại.",
          2: "Chưa xác định được vị trí. Hãy kiểm tra GPS hoặc kết nối mạng rồi thử lại.",
          3: "Lấy vị trí quá lâu. Hãy thử lại ở nơi có tín hiệu tốt hơn.",
        };
        setStatus(
          messages[error.code] || `Không thể lấy vị trí: ${error.message}`,
          true,
        );
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
    );
  } else {
    setStatus("Trình duyệt của bạn không hỗ trợ định vị GPS.", true);
  }
});

// ==========================================
// XỬ LÝ TÌM KIẾM ĐỊA CHỈ (NOMINATIM)
// ==========================================
const btnSearch = document.getElementById("btn-search");

async function goiDichVuTimKiem(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function chuanHoaTimKiem(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLocaleLowerCase("vi");
}

const SEARCH_CATEGORIES = [
  {
    keywords: ["sieu thi", "supermarket"],
    tags: [["shop", "supermarket"]],
    localSearches: ["siêu thị", "supermarket"],
  },
  {
    keywords: ["nha thuoc", "hieu thuoc", "tiem thuoc", "pharmacy", "chemist"],
    tags: [
      ["amenity", "pharmacy"],
      ["shop", "chemist"],
      ["shop", "pharmacy"],
    ],
    localSearches: ["nhà thuốc", "pharmacy"],
  },
  {
    keywords: ["benh vien", "hospital"],
    tags: [
      ["amenity", "hospital"],
      ["healthcare", "hospital"],
    ],
    localSearches: ["bệnh viện", "hospital"],
  },
  {
    keywords: ["ca phe", "cafe", "coffee"],
    tags: [["amenity", "cafe"]],
    localSearches: ["cà phê", "cafe"],
  },
  {
    keywords: ["rap chieu phim", "cinema"],
    tags: [["amenity", "cinema"]],
    localSearches: ["rạp chiếu phim", "cinema"],
  },
  {
    keywords: ["cong vien", "park"],
    tags: [["leisure", "park"]],
    localSearches: ["công viên", "park"],
  },
];

const SEARCH_STOP_WORDS = new Set([
  "gan",
  "day",
  "toi",
  "ban",
  "quanh",
  "near",
  "nearby",
  "me",
  "here",
  "around",
  "please",
  "tim",
  "kiem",
  "o",
  "tai",
]);

function phanTichTruyVan(query) {
  const normalizedQuery = chuanHoaTimKiem(query);
  const category = SEARCH_CATEGORIES.flatMap((item) =>
    item.keywords.map((keyword) => ({ item, keyword })),
  )
    .sort((a, b) => b.keyword.length - a.keyword.length)
    .find(({ keyword }) =>
      new RegExp(
        `(^|\\s)${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|\\s)`,
      ).test(normalizedQuery),
    )?.item;
  const remainingText = category
    ? SEARCH_CATEGORIES.flatMap((item) => item.keywords).reduce(
        (text, keyword) =>
          text.replace(
            new RegExp(
              `(^|\\s)${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|\\s)`,
              "g",
            ),
            " ",
          ),
        normalizedQuery,
      )
    : normalizedQuery;

  return {
    category,
    words: remainingText
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length >= 2 && !SEARCH_STOP_WORDS.has(word)),
  };
}

function tachTuTimKiem(text) {
  return chuanHoaTimKiem(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function taoKetQuaPhoton(feature, origin) {
  const properties = feature.properties || {};
  const [lon, lat] = feature.geometry?.coordinates || [];
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    (properties.countrycode && properties.countrycode.toLowerCase() !== "vn") ||
    (!properties.countrycode &&
      !chuanHoaTimKiem(properties.country || "").includes("viet nam"))
  ) {
    return null;
  }

  const name = properties.name || properties.street || "Địa điểm";
  const address = [
    properties.housenumber,
    properties.street,
    properties.district,
    properties.city,
    properties.state,
    properties.country,
  ]
    .filter(Boolean)
    .filter((part, index, parts) => parts.indexOf(part) === index);
  const nameSearchText = chuanHoaTimKiem(name);
  const addressSearchText = chuanHoaTimKiem(
    [...address, properties.osm_value].filter(Boolean).join(" "),
  );

  return {
    lat,
    lon,
    name,
    display_name: [name, ...address].join(", "),
    nameSearchText,
    addressSearchText,
    distance: origin ? map.distance(origin, [lat, lon]) : 0,
    categoryKey: properties.osm_key,
    categoryValue: properties.osm_value,
    id: properties.osm_id,
    osmType: properties.osm_type,
    phone: properties.phone || properties.contact_phone,
    openingHours: properties.opening_hours,
    website: properties.website || properties.url,
  };
}

function sapXepKetQuaTimKiem(places, query) {
  const { category, words } = phanTichTruyVan(query);
  const scored = places
    .map((place) => {
      if (
        category &&
        !category.tags.some(
          ([key, value]) =>
            place.categoryKey === key && place.categoryValue === value,
        )
      ) {
        return null;
      }

      if (words.length === 0) return { ...place, relevance: 0 };

      const matchesWords = (text) => {
        const resultWords = tachTuTimKiem(text);
        const exactSequence = resultWords.some((_, startIndex) =>
          words.every((word, wordIndex) => {
            const resultWord = resultWords[startIndex + wordIndex];
            return (
              resultWord === word ||
              (wordIndex === words.length - 1 &&
                word.length >= 3 &&
                resultWord?.startsWith(word))
            );
          }),
        );
        return exactSequence ? 2 : 0;
      };

      const nameMatch = matchesWords(place.nameSearchText || "");
      const addressMatch = matchesWords(place.addressSearchText || "");
      const relevance = nameMatch ? 100 + nameMatch : addressMatch;
      return relevance ? { ...place, relevance } : null;
    })
    .filter(Boolean);

  return scored.sort(
    (a, b) => b.relevance - a.relevance || a.distance - b.distance,
  );
}

async function timKiemNominatim(query, origin, signal) {
  const fallbackParams = new URLSearchParams({
    format: "jsonv2",
    addressdetails: "1",
    countrycodes: "vn",
    limit: "40",
    q: query,
  });
  const fallbackResults = await goiDichVuTimKiem(
    `https://nominatim.openstreetmap.org/search?${fallbackParams}`,
    signal,
  );
  return fallbackResults.map((place) => {
    const lat = Number(place.lat);
    const lon = Number(place.lon);
    const name =
      place.name || place.namedetails?.name || place.display_name.split(",")[0];
    return {
      lat,
      lon,
      name,
      display_name: place.display_name,
      nameSearchText: chuanHoaTimKiem(name),
      addressSearchText: chuanHoaTimKiem(
        `${place.display_name} ${place.type || ""}`,
      ),
      distance: map.distance(origin, [lat, lon]),
      categoryKey: place.class || place.category || null,
      categoryValue: place.type || null,
      id: place.osm_id,
      osmType: place.osm_type,
      phone: place.extratags?.phone || place.extratags?.["contact:phone"],
      openingHours: place.extratags?.opening_hours,
      website: place.extratags?.website || place.extratags?.["contact:website"],
    };
  });
}

async function timKiemDanhMucGanDay(category, origin, signal) {
  const radiusInKm = searchRadiusMeters / 1000;
  const latitudeOffset = radiusInKm / 111.32;
  const longitudeOffset =
    radiusInKm /
    (111.32 * Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.01));
  const bbox = [
    origin.lng - longitudeOffset,
    origin.lat - latitudeOffset,
    origin.lng + longitudeOffset,
    origin.lat + latitudeOffset,
  ].join(",");
  const responses = await Promise.allSettled(
    category.localSearches.map(async (term) => {
      const params = new URLSearchParams({
        q: term,
        bbox,
        limit: "100",
      });
      const response = await goiDichVuTimKiem(
        `https://photon.komoot.io/api/?${params}`,
        signal,
      );
      return (response.features || [])
        .map((feature) => taoKetQuaPhoton(feature, origin))
        .filter(Boolean)
        .filter((place) => place.distance <= radiusInKm * 1000)
        .filter((place) =>
          category.tags.some(
            ([key, value]) =>
              place.categoryKey === key && place.categoryValue === value,
          ),
        );
    }),
  );
  const successfulResponses = responses.filter(
    (result) => result.status === "fulfilled",
  );
  if (successfulResponses.length === 0) {
    const firstError = responses.find((result) => result.status === "rejected");
    throw firstError.reason;
  }

  return successfulResponses.flatMap((result) => result.value);
}

async function timKiemTrenBanDo(query, signal) {
  const origin = currentMarker?.getLatLng() || map.getCenter();
  const { category, words } = phanTichTruyVan(query);
  const photonParams = new URLSearchParams({
    q: query,
    lat: String(origin.lat),
    lon: String(origin.lng),
    limit: "100",
  });
  let photonError = null;
  let places = [];

  if (!category || words.length > 0) {
    try {
      const photonResponse = await goiDichVuTimKiem(
        `https://photon.komoot.io/api/?${photonParams}`,
        signal,
      );
      places = (photonResponse.features || [])
        .map((feature) => taoKetQuaPhoton(feature, origin))
        .filter(Boolean);
    } catch (error) {
      if (error.name === "AbortError") throw error;
      photonError = error;
      console.warn("Photon không khả dụng, chuyển sang Nominatim:", error);
    }
  }

  if (category) {
    try {
      const nearbyPlaces = await timKiemDanhMucGanDay(category, origin, signal);
      places.push(...nearbyPlaces);
    } catch (error) {
      if (error.name === "AbortError") throw error;
      console.warn("Không tải được kết quả theo khu vực gần:", error);
    }
  }

  let sortedPlaces = sapXepKetQuaTimKiem(places, query);
  if (sortedPlaces.length === 0) {
    try {
      places = await timKiemNominatim(query, origin, signal);
      sortedPlaces = sapXepKetQuaTimKiem(places, query);
    } catch (error) {
      if (error.name === "AbortError") throw error;
      if (photonError) {
        throw new Error(
          `Không thể kết nối Photon (${photonError.message}) hoặc Nominatim (${error.message}).`,
        );
      }
      throw error;
    }
  }

  if (category && words.length === 0) {
    sortedPlaces = sortedPlaces.filter(
      (place) => place.distance <= searchRadiusMeters,
    );
  }

  const deduplicated = new Map();
  for (const place of sortedPlaces) {
    const key =
      place.id != null
        ? `${place.osmType}/${place.id}`
        : `${chuanHoaTimKiem(place.name)}:${place.lat.toFixed(5)},${place.lon.toFixed(5)}`;
    if (!deduplicated.has(key)) deduplicated.set(key, place);
  }
  return Array.from(deduplicated.values());
}

function chonKetQuaTimKiem(place) {
  clearTimeout(searchDebounceTimer);
  if (searchController) searchController.abort();
  searchRequestId++;
  btnSearch.disabled = false;

  const lat = Number(place.lat);
  const lon = Number(place.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    setStatus(
      "Kết quả tìm kiếm không có tọa độ hợp lệ. Hãy thử từ khóa khác.",
      true,
    );
    return;
  }

  searchInput.value = place.display_name;
  searchResults.classList.add("hidden");
  if (!currentMarker) {
    chonViTri([lat, lon], place.display_name, place);
    setStatus(`Đã chuyển bản đồ đến: ${place.display_name}`);
    return;
  }

  if (selectedPlaceMarker) {
    selectedPlaceMarker.closePopup();
    selectedPlaceLayer.removeLayer(selectedPlaceMarker);
  }

  selectedPlaceMarker = L.marker([lat, lon], {
    title: place.name,
    zIndexOffset: 1000,
  });
  ganTheThongTin(selectedPlaceMarker, place, place.distance);
  selectedPlaceMarker.addTo(selectedPlaceLayer);
  map.panTo([lat, lon]);
  selectedPlaceMarker.openPopup();
  setStatus(`Đã ghim ${place.name}. Vị trí của bạn vẫn được giữ nguyên.`);
}

function hienThiKetQuaTimKiem(places) {
  searchResults.replaceChildren();
  activeSearchResultIndex = -1;
  if (places.length === 0) {
    const item = document.createElement("li");
    item.textContent = "Không tìm thấy địa điểm phù hợp.";
    item.setAttribute("aria-disabled", "true");
    searchResults.appendChild(item);
    searchResults.classList.remove("hidden");
    setStatus(
      "Không tìm thấy địa điểm. Hãy thử thêm tên quận, thành phố hoặc tỉnh.",
    );
    return;
  }

  places.forEach((place, index) => {
    const item = document.createElement("li");
    item.tabIndex = 0;
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", "false");
    const name = document.createElement("strong");
    name.textContent = place.name;
    const address = document.createElement("span");
    address.textContent = place.display_name;
    const distance = document.createElement("span");
    distance.className = "search-result-distance";
    distance.textContent =
      place.distance < 1000
        ? `${Math.round(place.distance)} m`
        : `${(place.distance / 1000).toFixed(1).replace(".", ",")} km`;
    item.append(name, address, distance);
    item.addEventListener("click", () => chonKetQuaTimKiem(place));
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        chonKetQuaTimKiem(place);
      }
    });
    item.addEventListener("mouseenter", () => datKetQuaTimKiemDangChon(index));
    searchResults.appendChild(item);
  });
  searchResults.classList.remove("hidden");
  datKetQuaTimKiemDangChon(0);
  setStatus(
    `Tìm thấy ${places.length} kết quả; ưu tiên khớp tên và địa điểm gần bạn. Chọn kết quả hoặc nhấn Enter.`,
  );
}

function datKetQuaTimKiemDangChon(index) {
  const options = searchResults.querySelectorAll('[role="option"]');
  if (options.length === 0) return;

  activeSearchResultIndex = Math.max(0, Math.min(index, options.length - 1));
  options.forEach((option, optionIndex) => {
    const isSelected = optionIndex === activeSearchResultIndex;
    option.setAttribute("aria-selected", String(isSelected));
    if (isSelected) option.scrollIntoView({ block: "nearest" });
  });
}

async function timKiemDiaChi() {
  const query = searchInput.value.trim();
  if (query.length < 2) {
    setStatus("Nhập ít nhất 2 ký tự để tìm địa điểm.");
    return;
  }

  clearTimeout(searchDebounceTimer);
  if (searchController) searchController.abort();
  searchController = new AbortController();
  const controller = searchController;
  const requestId = ++searchRequestId;
  let searchTimeoutId = null;
  let searchTimedOut = false;
  btnSearch.disabled = true;
  searchResults.replaceChildren();
  searchResults.classList.add("hidden");
  setStatus("Đang tìm địa điểm...");

  try {
    if (controller.signal.aborted || requestId !== searchRequestId) return;

    searchTimeoutId = setTimeout(() => {
      searchTimedOut = true;
      controller.abort();
    }, 15000);
    const places = await timKiemTrenBanDo(query, controller.signal);
    if (requestId !== searchRequestId) return;
    hienThiKetQuaTimKiem(places);
  } catch (error) {
    if (error.name === "AbortError") {
      if (searchTimedOut && requestId === searchRequestId) {
        setStatus("Tìm kiếm quá lâu. Hãy kiểm tra mạng và thử lại.", true);
      }
      return;
    }
    console.error("Lỗi khi tìm kiếm địa chỉ:", error);
    if (requestId === searchRequestId) {
      setStatus(
        "Các máy chủ tìm kiếm hiện không phản hồi. Hãy kiểm tra mạng hoặc thử lại sau.",
        true,
      );
    }
  } finally {
    if (searchTimeoutId) clearTimeout(searchTimeoutId);
    if (requestId === searchRequestId) btnSearch.disabled = false;
  }
}

btnSearch.addEventListener("click", timKiemDiaChi);
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    const options = searchResults.querySelectorAll('[role="option"]');
    if (
      !searchResults.classList.contains("hidden") &&
      activeSearchResultIndex >= 0 &&
      options[activeSearchResultIndex]
    ) {
      options[activeSearchResultIndex].click();
      return;
    }
    timKiemDiaChi();
  } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    const options = searchResults.querySelectorAll('[role="option"]');
    if (options.length === 0) return;
    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    datKetQuaTimKiemDangChon(
      activeSearchResultIndex < 0
        ? direction > 0
          ? 0
          : options.length - 1
        : activeSearchResultIndex + direction,
    );
  } else if (event.key === "Escape") {
    searchResults.classList.add("hidden");
    activeSearchResultIndex = -1;
  }
});
searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounceTimer);
  if (searchController) searchController.abort();
  searchRequestId++;
  btnSearch.disabled = false;
  activeSearchResultIndex = -1;
  searchResults.replaceChildren();
  searchResults.classList.add("hidden");
  const query = searchInput.value.trim();
  if (query.length < 2) {
    setStatus("Nhập ít nhất 2 ký tự để xem gợi ý địa điểm.");
    return;
  }

  setStatus("Đang chờ bạn nhập...");
  searchDebounceTimer = setTimeout(timKiemDiaChi, 450);
});

// Ẩn danh sách khi click ra ngoài
document.addEventListener("click", function (e) {
  if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
    searchResults.classList.add("hidden");
  }
});

// ==========================================
// GỌI OVERPASS: thử lần lượt từng máy chủ
// ==========================================
async function goiOverpass(query, signal) {
  let lastError = null;

  for (const server of OVERPASS_SERVERS) {
    const attemptController = new AbortController();
    const abortAttempt = () => attemptController.abort();
    signal.addEventListener("abort", abortAttempt, { once: true });
    const timeoutId = setTimeout(abortAttempt, 12000);
    try {
      const response = await fetch(
        `${server}?data=${encodeURIComponent(query)}`,
        { signal: attemptController.signal },
      );
      // 429 = gọi quá nhiều, 504 = máy chủ bận -> thử máy chủ tiếp theo
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.json();
    } catch (err) {
      if (signal.aborted) throw err;
      lastError = err;
      if (/^HTTP (429|5\d{2})$/.test(err.message)) break;
    } finally {
      clearTimeout(timeoutId);
      signal.removeEventListener("abort", abortAttempt);
    }
  }
  throw lastError;
}

// Photon is independent from Overpass and can provide a limited nearby fallback.
async function goiPhotonDiaDiem(
  category,
  latlng,
  outerRadiusInMeters,
  innerRadiusInMeters,
  signal,
) {
  const searchTerms = {
    cafe: "cafe",
    food: "quán ăn vặt",
    cinema: "rạp chiếu phim",
    park: "công viên",
  };
  const expectedTags = {
    cafe: ["amenity", "cafe"],
    food: ["amenity", "fast_food"],
    cinema: ["amenity", "cinema"],
    park: ["leisure", "park"],
  };
  const latitudeOffset = outerRadiusInMeters / 111320;
  const longitudeOffset =
    outerRadiusInMeters /
    (111320 * Math.max(Math.cos((latlng.lat * Math.PI) / 180), 0.01));
  const params = new URLSearchParams({
    q: searchTerms[category],
    bbox: [
      latlng.lng - longitudeOffset,
      latlng.lat - latitudeOffset,
      latlng.lng + longitudeOffset,
      latlng.lat + latitudeOffset,
    ].join(","),
    limit: "100",
  });
  const requestController = new AbortController();
  const abortRequest = () => requestController.abort();
  signal.addEventListener("abort", abortRequest, { once: true });
  const timeoutId = setTimeout(abortRequest, 12000);
  let data;
  try {
    const response = await fetch(`https://photon.komoot.io/api/?${params}`, {
      signal: requestController.signal,
    });
    if (!response.ok) throw new Error(`Photon HTTP ${response.status}`);
    data = await response.json();
  } catch (error) {
    if (signal.aborted) throw error;
    if (requestController.signal.aborted) {
      throw new Error("Photon request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    signal.removeEventListener("abort", abortRequest);
  }
  const [expectedKey, expectedValue] = expectedTags[category];
  return (data.features || [])
    .filter((feature) => {
      const properties = feature.properties || {};
      const coordinates = feature.geometry?.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length < 2) return false;

      const [lon, lat] = coordinates;
      return (
        properties.osm_key === expectedKey &&
        properties.osm_value === expectedValue &&
        Number.isFinite(lat) &&
        Number.isFinite(lon) &&
        map.distance(latlng, [lat, lon]) > innerRadiusInMeters &&
        map.distance(latlng, [lat, lon]) <= outerRadiusInMeters
      );
    })
    .slice(0, 30)
    .map((feature) => {
      const properties = feature.properties;
      const [lon, lat] = feature.geometry.coordinates;
      const osmTypes = { N: "node", W: "way", R: "relation" };
      return {
        type: osmTypes[properties.osm_type] || "photon",
        id:
          properties.osm_id ?? `coordinate/${lat.toFixed(6)}/${lon.toFixed(6)}`,
        lat,
        lon,
        tags: {
          name: properties.name || "Địa điểm không có tên",
          [expectedKey]: expectedValue,
          ...(properties.phone ? { phone: properties.phone } : {}),
          ...(properties.opening_hours
            ? { opening_hours: properties.opening_hours }
            : {}),
          ...(properties.website ? { website: properties.website } : {}),
          ...(properties.street ? { "addr:street": properties.street } : {}),
          ...(properties.city ? { "addr:city": properties.city } : {}),
        },
      };
    });
}

// ==========================================
// HÀM LẤY DỮ LIỆU TỪ OVERPASS API
// ==========================================
async function timDiaDiemXungQuanh(category) {
  if (!currentMarker) {
    alert(
      "Vui lòng bấm 'Lấy vị trí' hoặc tìm một địa chỉ làm tâm trước khi lọc!",
    );
    const active = document.querySelector(".chip.active");
    if (active) active.classList.remove("active");
    searchInput.value = "";
    return;
  }

  const latlng = currentMarker.getLatLng();
  const radiusInMeters = searchRadiusMeters;
  const centerKey = `${latlng.lat.toFixed(6)},${latlng.lng.toFixed(6)}`;
  if (
    poiSearchCache.centerKey !== centerKey ||
    poiSearchCache.category !== category
  ) {
    xoaBoNhoDiaDiem();
    poiSearchCache.centerKey = centerKey;
    poiSearchCache.category = category;
  }

  const previousRadius = poiSearchCache.searchedRadiusMeters;
  if (radiusInMeters <= previousRadius) {
    const visibleCount = capNhatGhimTheoBanKinh(radiusInMeters);
    setStatus(
      `Đang hiển thị ${visibleCount} địa điểm đã tìm thấy trong phạm vi ${
        radiusInMeters / 1000
      } km.`,
    );
    return;
  }

  let tag = "";
  if (category === "cafe") tag = "amenity=cafe";
  if (category === "food") tag = "amenity=fast_food";
  if (category === "cinema") tag = "amenity=cinema";
  if (category === "park") tag = "leisure=park";

  // nwr = node + way + relation. Công viên, rạp phim thường được vẽ là
  // "way" (vùng) nên query cũ chỉ lấy node sẽ bỏ sót gần hết.
  // "out center" trả về tọa độ tâm cho way/relation.
  const areaQuery =
    previousRadius > 0
      ? `
        (
          nwr[${tag}](around:${radiusInMeters},${latlng.lat},${latlng.lng});
          - nwr[${tag}](around:${previousRadius},${latlng.lat},${latlng.lng});
        );
      `
      : `nwr[${tag}](around:${radiusInMeters},${latlng.lat},${latlng.lng});`;
  const query = `[out:json][timeout:10];${areaQuery}out center 30;`;

  // Hủy yêu cầu cũ (nếu còn đang chạy) để kết quả cũ không đè lên kết quả mới
  if (poiController) poiController.abort();
  poiController = new AbortController();
  const signal = poiController.signal;

  const oldPlaceCount = poiSearchCache.places.size;
  setStatus("Đang tìm địa điểm xung quanh...");

  try {
    let elements;
    let usingFallback = false;
    try {
      const data = await goiOverpass(query, signal);
      elements = data.elements || [];
    } catch (error) {
      if (signal.aborted) throw error;
      console.warn("Overpass không khả dụng, đang chuyển sang Photon:", error);
      setStatus("Máy chủ dữ liệu đang bận. Đang thử nguồn dự phòng...");
      elements = await goiPhotonDiaDiem(
        category,
        latlng,
        radiusInMeters,
        previousRadius,
        signal,
      );
      usingFallback = true;
    }

    if (signal.aborted) return;
    let addedCount = 0;
    elements.forEach((element) => {
      // node có lat/lon, way/relation có element.center
      const lat = element.lat ?? element.center?.lat;
      const lon = element.lon ?? element.center?.lon;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      const distance = map.distance(latlng, [lat, lon]);
      if (distance <= previousRadius || distance > radiusInMeters) return;

      const placeKey =
        element.type && element.id != null
          ? `${element.type}/${element.id}`
          : `coordinate/${lat.toFixed(6)}/${lon.toFixed(6)}`;
      if (poiSearchCache.places.has(placeKey)) return;

      const tags = element.tags || {};
      const name = tags.name || "Địa điểm không có tên";
      const categoryKey = [
        "amenity",
        "shop",
        "leisure",
        "healthcare",
        "tourism",
        "office",
      ].find((key) => tags[key]);
      const address = [
        tags["addr:housenumber"],
        tags["addr:street"],
        tags["addr:suburb"],
        tags["addr:city"],
      ].filter(Boolean);
      const place = {
        lat,
        lon,
        name,
        display_name: address.join(", "),
        tags,
        categoryKey,
        categoryValue: categoryKey ? tags[categoryKey] : "",
        distance,
        phone: tags.phone || tags["contact:phone"],
        openingHours: tags.opening_hours,
        website: tags.website || tags["contact:website"],
      };

      const marker = L.marker([lat, lon]);
      ganTheThongTin(marker, place, distance);
      marker.addTo(poiLayer);
      poiSearchCache.places.set(placeKey, { marker, distance });
      addedCount++;
    });
    poiSearchCache.searchedRadiusMeters = radiusInMeters;
    poiSearchCache.source = usingFallback
      ? "nguồn dự phòng"
      : "máy chủ dữ liệu";
    const visibleCount = capNhatGhimTheoBanKinh(radiusInMeters);

    setStatus(
      addedCount > 0
        ? `Đã thêm ${addedCount} địa điểm mới; đang hiển thị ${visibleCount} địa điểm. ${
            usingFallback ? "Đã dùng nguồn dự phòng." : ""
          }`
        : oldPlaceCount > 0
          ? `Không có địa điểm mới. Đang giữ ${visibleCount} địa điểm đã tìm thấy.${
              usingFallback ? " Đã dùng nguồn dự phòng." : ""
            }`
          : usingFallback
            ? "Nguồn dự phòng không tìm thấy địa điểm phù hợp trong phạm vi tìm kiếm. Hãy thử lại sau."
            : "Không tìm thấy địa điểm nào trong phạm vi tìm kiếm.",
    );
  } catch (err) {
    if (err.name === "AbortError") return; // bị thay bằng yêu cầu mới, không phải lỗi
    console.error("Lỗi tải địa điểm:", err);
    setStatus(
      `Không thể tải phần địa điểm mới. ${poiSearchCache.places.size} địa điểm đã tìm trước đó vẫn được giữ lại. Hãy kiểm tra mạng hoặc thử lại sau.`,
      true,
    );
  }
}


// Bật định vị để lấy vị trí hiện tại của người dùng
map.locate({ setView: true, maxZoom: 14 });

// Khi lấy được vị trí thành công, sự kiện này sẽ chạy
map.on("locationfound", function (e) {
  const userLat = e.latlng.lat;
  const userLng = e.latlng.lng;
  const radiusInKm = searchRadiusMeters / 1000;

  capNhatVungViTri(e.latlng);

  // Đánh dấu vị trí của người dùng bằng một marker khác màu
  L.marker([userLat, userLng])
    .addTo(map)
    .bindPopup("Vị trí của bạn")
    .openPopup();

  // Gọi API Backend, truyền tọa độ của TỪNG MÁY lên để lấy dữ liệu
 fetch(
    `/api/poi/nearby?lat=${userLat}&lng=${userLng}&radius=${radiusInKm}`
  )
    .then((response) => response.json())
    .then((data) => {
      // Lặp data và vẽ các địa điểm lên bản đồ như cũ
      console.log("Các địa điểm xung quanh:", data);
      // ... (Code L.marker của Bảo)
    });
});

// Nếu người dùng từ chối cấp quyền vị trí
map.on("locationerror", function (e) {
  alert(
    "Không thể lấy vị trí của bạn. Vui lòng cấp quyền vị trí cho trình duyệt.",
  );
});

// ==========================================
// TỰ ĐỘNG LẤY TỌA ĐỘ TỪ URL (TỪ TRANG CHỦ CHUYỂN SANG)
// ==========================================
document.addEventListener("DOMContentLoaded", function () {
  // Lấy các tham số trên đường dẫn (ví dụ: ?lat=10.77&lng=106.69&name=Dinh...)
  const urlParams = new URLSearchParams(window.location.search);
  const passedLat = urlParams.get("lat");
  const passedLng = urlParams.get("lng");
  const passedName = urlParams.get("name");

  // Nếu có truyền tọa độ
  if (passedLat && passedLng) {
    const lat = parseFloat(passedLat);
    const lng = parseFloat(passedLng);

    // Gọi hàm chonViTri (hàm cắm ghim và vẽ vòng tròn đã có sẵn trong code của bạn)
    chonViTri([lat, lng], passedName || "Địa điểm đề xuất");

    // Bay bản đồ tới đó
    map.setView([lat, lng], 15);

    // Cập nhật câu thông báo
    setStatus(
      `Đã chuyển đến ${passedName || "địa điểm đề xuất"}. Bạn có thể chọn bộ lọc bên trái.`,
    );
  }
});
