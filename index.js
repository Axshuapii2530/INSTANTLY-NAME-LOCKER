/**
 * Group Name Locker Bot (Fast + Instant Reset)
 * Developer: Axshu 🩷
 * Description: This bot locks the group name and resets it instantly if changed.
 * Features: 2-second delay with spam prevention, won't change your own profile name
 */

const login = require("ws3-fca");
const fs = require("fs");
const express = require("express");

// ✅ Load AppState
let appState;
try {
  appState = JSON.parse(fs.readFileSync("appstate.json", "utf-8"));
} catch (err) {
  console.error("❌ Error reading appstate.json:", err);
  process.exit(1);
}

// ✅ Group Info (change these)
const GROUP_THREAD_ID = "3779662075668749";        // Group ka ID
const LOCKED_GROUP_NAME = "🔐 आफत की दीदी फातिमा हगनी को बाबरी मस्जिद में चोदूं 🐼";     // Locked name

// Variables for spam prevention
let lastTitleCheck = {};
let resetTimeout = null;
let isProcessing = false;

// ✅ Express Server to keep bot alive (for Render or UptimeRobot)
const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (req, res) =>
  res.send("🤖 Group Name Locker Bot is alive! 👨‍💻 Developer: Axshu 🩷")
);
app.listen(PORT, () =>
  console.log(`🌐 Web server running on port ${PORT}`)
);

/**
 * Safe function to set title with logging and simple retry.
 */
function safeSetTitle(api, title, threadID, cb) {
  api.setTitle(title, threadID, (err) => {
    if (err) {
      console.error(
        `❌ safeSetTitle failed to set "${title}" on ${threadID}:`,
        err
      );
      if (typeof cb === "function") cb(err);
    } else {
      console.log(`🔒 Group title set to "${title}" on ${threadID}`);
      if (typeof cb === "function") cb(null);
    }
  });
}

/**
 * Check and reset group name with 2-second delay and spam prevention
 */
function checkAndResetTitle(api, forceCheck = false) {
  if (isProcessing) {
    console.log("⚠️ Already processing a title reset, skipping...");
    return;
  }

  const now = Date.now();
  
  // Spam prevention: Don't check more than once every 2 seconds
  if (!forceCheck && lastTitleCheck[GROUP_THREAD_ID]) {
    const timeSinceLastCheck = now - lastTitleCheck[GROUP_THREAD_ID];
    if (timeSinceLastCheck < 2000) {
      console.log(`⏳ Skipping check (${timeSinceLastCheck}ms since last check)`);
      return;
    }
  }

  lastTitleCheck[GROUP_THREAD_ID] = now;
  
  // Get current thread info
  api.getThreadInfo(GROUP_THREAD_ID, (err, info) => {
    if (err) {
      console.error("❌ Error fetching group info:", err);
      return;
    }

    const currentName = info?.name || info?.threadName || "Unknown";
    
    if (currentName !== LOCKED_GROUP_NAME) {
      console.warn(`⚠️ Name changed to "${currentName}", scheduling reset in 2 seconds...`);
      
      // Clear any existing timeout
      if (resetTimeout) {
        clearTimeout(resetTimeout);
      }
      
      // Set timeout for 2 seconds
      resetTimeout = setTimeout(() => {
        isProcessing = true;
        
        // Double-check after 2 seconds before resetting
        api.getThreadInfo(GROUP_THREAD_ID, (err2, info2) => {
          if (err2) {
            console.error("❌ Error in second verification:", err2);
            isProcessing = false;
            return;
          }
          
          const verifiedName = info2?.name || info2?.threadName || "Unknown";
          
          if (verifiedName !== LOCKED_GROUP_NAME) {
            console.log(`🔄 Resetting title from "${verifiedName}" to "${LOCKED_GROUP_NAME}"...`);
            safeSetTitle(api, LOCKED_GROUP_NAME, GROUP_THREAD_ID, (resetErr) => {
              if (!resetErr) {
                console.log("✅ Title reset successfully!");
              }
              isProcessing = false;
            });
          } else {
            console.log("✅ Name already corrected, no reset needed.");
            isProcessing = false;
          }
        });
      }, 2000);
    } else {
      console.log(`✅ Group name is already "${LOCKED_GROUP_NAME}"`);
    }
  });
}

/**
 * Polling fallback: checks group name every `pollIntervalMs`.
 */
function startPollingFallback(api, pollIntervalMs = 30 * 1000) {
  let stopped = false;

  function loop() {
    if (stopped) return;
    
    checkAndResetTitle(api);
    
    setTimeout(loop, pollIntervalMs);
  }
  
  loop();

  return () => {
    stopped = true;
    if (resetTimeout) {
      clearTimeout(resetTimeout);
    }
  };
}

/**
 * Event-driven instant reset with spam prevention
 */
function startEventListener(api) {
  try {
    api.listenMqtt((err, event) => {
      if (err) return console.error("❌ listenMqtt error:", err);

      if (event && event.type === "event" && event.logMessageType) {
        const t = event.logMessageType.toString();
        const looksLikeTitleChange =
          t === "log:thread-name" ||
          t === "log:thread-title" ||
          t === "log:thread-name-change" ||
          (t.includes("thread") && t.includes("name")) ||
          (t.includes("thread") && t.includes("title"));

        if (looksLikeTitleChange) {
          const threadId =
            event.threadID ||
            event.logMessageData?.threadID ||
            event.logMessageData?.threadId;

          // Only respond to group thread ID, not profile changes
          if (threadId && threadId.toString() === GROUP_THREAD_ID.toString()) {
            console.warn("⚠️ Event-driven: group title change detected.");
            
            // Wait 500ms before checking (let the change register)
            setTimeout(() => {
              checkAndResetTitle(api);
            }, 500);
          }
        }
      }
    });
  } catch (e) {
    console.error("❌ startEventListener crashed:", e);
  }
}

// 🟢 Facebook Login
login({ appState }, (err, api) => {
  if (err) {
    console.error("❌ Login Failed:", err);
    return;
  }

  console.log("✅ Logged in successfully.");
  console.log("👨‍💻 Developer: Axshu 🩷");
  console.log("🚀 Group name locker (fast + instant) activated.");
  console.log(`🔒 Locked name: "${LOCKED_GROUP_NAME}"`);
  console.log(`⏱️  Reset delay: 2 seconds with spam prevention`);

  // Initial check
  checkAndResetTitle(api, true);
  
  startEventListener(api); // Event-driven instant reset
  startPollingFallback(api, 30 * 1000); // Polling fallback every 30 seconds
});
