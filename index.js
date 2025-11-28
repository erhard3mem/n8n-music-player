import express from "express";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import * as mm from "music-metadata";
import { spawn } from "child_process"


const app = express();
const PORT = 3000;

app.use(express.json());

// Directory to scan (change this)
const MUSIC_DIR = "/home/erhard/Musik/AUTO";



// Recursively read files in directory
async function scanDirectory(dir) {
  let results = []
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const sub = await scanDirectory(fullPath);
      results = results.concat(sub);
    } else {
      // Only process audio files
      if (/\.(mp3|flac|m4a|wav|ogg)$/i.test(entry.name)) {
        try {
          const metadata = await mm.parseFile(fullPath, { duration: true });

          results.push({
            file: fullPath,
            title: metadata.common.title || path.basename(entry.name),
            artist: metadata.common.artist || null,
            album: metadata.common.album || null,
            genre: metadata.common.genre || [],
            year: metadata.common.year || null,
            duration: metadata.format.duration || null
          });
        } catch (err) {
          console.warn("Failed to read metadata:", fullPath, err.message);
        }
      }
    }
  }

  return results;
}

// REST API endpoint
app.get("/music", async (req, res) => {
  try {
    const songs = await scanDirectory(MUSIC_DIR);
    res.json(songs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function findSong(artist,title) {
  const songs = await scanDirectory(MUSIC_DIR);  
  for(let i=0;i<songs.length;i++) {
      const s = songs[i];
      if(s.artist === artist && s.title === title) {
         return s.file;
      }
    }
}

async function playTrack(track) {
  return new Promise((resolve, reject) => {
    const player = spawn("mplayer", [track]);

    player.stdout.on("data", (data) => {
      console.log(`mplayer: ${data}`);
    });

    player.stderr.on("data", (data) => {
      console.error(`mplayer error: ${data}`);
    });

    player.on("close", (code) => {
      console.log(`mplayer exited with code ${code}`);
      resolve();  // resolve the promise when song ends
    });

    player.on("error", (err) => {
      reject(err);  // reject if spawn fails
    });
  });
}


app.post("/play", async (req, res) => {
  try {
    const { songs } = req.body;
    const { tracks } = req.body;


    let collection = songs == undefined ? tracks : songs;

    console.log(songs);


    for (let i = 0; i < collection.length; i++) {
      const track = await findSong(collection[i].artist, collection[i].title);
      console.log("Playing:", track);

      // Wait for the track to finish before continuing
      await playTrack(track);
    }

    res.json({ message: "All songs finished playing" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Start server
app.listen(PORT, () => {
  console.log(`Music metadata API running at http://localhost:${PORT}`);
});
