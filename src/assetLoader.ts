// assetLoader.js
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { TextureLoader } from 'three';
import axios from 'axios';

const getMapData = async () => {
    try {
      const response = await axios.get('http://localhost:3000/api/battlemap/gettysburg_july_1_1863');
      return response.data;
    } catch (error) {
      console.error('Error:', error);
      return null; // Or throw error if you want to handle it higher up
    }
  };

export async function loadAssets(pmrem: { fromEquirectangular: (arg0: THREE.DataTexture) => any; }) {
    const envmapTexture: THREE.DataTexture = await new RGBELoader().loadAsync("assets/envmap.hdr");
    const rt: THREE.WebGLRenderTarget = pmrem.fromEquirectangular(envmapTexture);
    const envmap: THREE.Texture = rt.texture;

    const textures = {
        dirt: await new TextureLoader().loadAsync("assets/dirt.png"),
        dirt2: await new TextureLoader().loadAsync("assets/dirt2.jpg"),
        grass: [ // Keep as array for variation
            await new TextureLoader().loadAsync("assets/grass1-albedo3.png"),
            await new TextureLoader().loadAsync("assets/grass.jpg")
        ],
        grassNormal: await new TextureLoader().loadAsync("assets/grass1-normal1-dx.png"),
        sand: await new TextureLoader().loadAsync("assets/sand.jpg"),
        water: await new TextureLoader().loadAsync("assets/water.jpg"),
        stone: await new TextureLoader().loadAsync("assets/stone.png"),
        Clear:  await new TextureLoader().loadAsync("assets/grass1-albedo3.png"),
    };
    let map = await getMapData()
    map = {
        hex_data: map.hexes,
        map_dimensions: map.mapDimensions,
        strategic_control_zones: map.strategicControlZones,
        landmarks: map.landmarks
    }

    // const mapDataResponse = await fetch("assets/gettysburg_map_data.json");

    // const loadedMapData = await mapDataResponse.json();

    // console.log("MAP==>",map, "MAP DATA", loadedMapData)
    return { envmap, textures, loadedMapData: map};
}