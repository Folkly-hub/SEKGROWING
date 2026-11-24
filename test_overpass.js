const https = require('https');

function queryOverpass(lat, lng) {
  const query = `[out:json][timeout:5];
(
  way["building"](around:80,${lat},${lng});
  way["natural"="water"](around:80,${lat},${lng});
  way["waterway"](around:80,${lat},${lng});
);
out tags;`;

  return new Promise((resolve) => {
    https.get(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`, { headers: { 'User-Agent': 'SekGrowingApp/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.elements || []);
        } catch (e) {
          resolve([]);
        }
      });
    }).on('error', () => resolve([]));
  });
}

async function run() {
  console.log("Checking Bangkok City (13.7563, 100.5018)...");
  const city = await queryOverpass(13.7563, 100.5018);
  console.log("City results count:", city.length, city.slice(0, 3).map(e => e.tags));

  console.log("Checking Rice Field (15.7285, 100.1620)...");
  const field = await queryOverpass(15.7285, 100.1620);
  console.log("Field results count:", field.length);

  console.log("Checking Chao Phraya River (13.7469, 100.4930)...");
  const river = await queryOverpass(13.7469, 100.4930);
  console.log("River results count:", river.length, river.map(e => e.tags));
}

run();
