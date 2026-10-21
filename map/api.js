// Hàm lấy danh sách điểm
async function fetchPois() {
    const response = await fetch('/api/pois');
    return await response.json();
}

// Hàm gửi điểm mới
async function savePoi(toaDoMoi) {
    const response = await fetch('/api/pois', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toaDoMoi)
    });
    return response.ok;
}