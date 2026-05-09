# 🍅 Pomodoro Timer

A polished, feature-rich Pomodoro timer app built with vanilla HTML, CSS, and JavaScript. Designed to help you stay focused, track work sessions, and build healthy work/rest habits — with no frameworks, no build tools, and no dependencies.

![Static Badge](https://img.shields.io/badge/built_with-HTML_%7C_CSS_%7C_JS-orange?style=flat-square)
![Static Badge](https://img.shields.io/badge/framework-none-lightgrey?style=flat-square)
![Static Badge](https://img.shields.io/badge/license-MIT-blue?style=flat-square)

---

## ✨ Features

### ⏱ Standard Timer (Count-Up)
- High-precision stopwatch with millisecond display
- Records and saves session data to `localStorage`
- Automatically suggests a break after each session based on time worked

### ⏳ Custom Timer (Countdown)
- Set any duration via hours, minutes, and seconds inputs
- Quick-select presets: **5 min**, **10 min**, **25 min**, **50 min**
- Animated circular SVG progress ring that drains as time counts down
- Ring color shifts from **green → amber → red** as urgency increases

### 🎨 Visual Enhancements
- **Dynamic background gradient** — subtly warms from cool blue-black to amber as sessions progress
- **Animated edge glow** — screen border pulses teal → amber → red with session intensity
- **Heartbeat pulse** — timer digits pulse on every second tick

### 🎉 Celebration & Rest Flow
- Confetti celebration screen on session completion
- **Break Timer modal** with its own circular countdown ring and skip option
- Rest duration automatically calculated from session length

### 🔔 Alarm & Audio
- Two selectable alarm sounds: **Low** and **High**
- Adjustable volume slider with dynamic 🔇/🔈/🔉/🔊 icon
- Volume preference persisted across sessions via `localStorage`

### 🖥 Fullscreen Mode
- Distraction-free fullscreen overlay showing live timer and session status
- Toggle via button or **`F`** key

### ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Start / Pause / Resume active timer |
| `F` | Toggle fullscreen overlay |
| `Escape` | Exit fullscreen or skip break modal |

### 🔔 Browser Notifications
- Native desktop notifications on session completion (with permission)

---

## 📁 Project Structure

```
pomodoro-app/
├── index.html        # App markup and layout
├── style.css         # All styles, animations, and theming
├── script.js         # Timer logic, visual enhancements, and state management
├── alarm.mp3         # Low alarm sound
├── alarmhigh.mp3     # High alarm sound
└── favicon.png       # App icon
```

---

## 🚀 Getting Started

No build step required. Just open the project in a browser.

### Run locally

```bash
# Clone the repository
git clone https://github.com/your-username/pomodoro-app.git
cd pomodoro-app

# Open directly in browser
open index.html
```

Or serve it with any static file server:

```bash
# Using Python
python3 -m http.server 8080

# Using Node.js (npx)
npx serve .
```

Then visit `http://localhost:8080`.

---

## 🌐 Deployment

This app is a fully static site — deploy it anywhere that serves HTML files.

### GitHub Pages

1. Push your code to a GitHub repository.
2. Go to **Settings → Pages**.
3. Set the source to the `main` branch and `/ (root)` folder.
4. Your app will be live at `https://your-username.github.io/pomodoro-app/`.

### Other Platforms

| Platform | Deploy |
|----------|--------|
| [Netlify](https://netlify.com) | Drag & drop the project folder |
| [Vercel](https://vercel.com) | `vercel --prod` in the project directory |
| [Cloudflare Pages](https://pages.cloudflare.com) | Connect GitHub repo, no build command needed |

---

## 🛠 Technical Notes

- Uses `requestAnimationFrame` for smooth, high-precision timer updates
- Handles tab visibility changes to prevent timer drift when the window is backgrounded
- All user preferences (volume, session history) are persisted via `localStorage`
- Fully accessible: ARIA labels, live regions, and semantic roles throughout
- No external JavaScript dependencies

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
