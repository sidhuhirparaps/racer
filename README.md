# Desk Racer

A desk-scale kart race in the browser. Drive a closed circuit over a dark desk, drift for a boost, and race a friend on the same Wi-Fi.

The playable app is React, Vite, and React Three Fiber. `FINAL.html` is the original single-file version.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173/. `npm run dev` uses `vite --host`, so another device on the same network can use the Network URL Vite prints.

```bash
npm run build
npm run preview
```

## Race

In the lobby, pick laps (1, 3, 5, or 8), bots (0, 1, or 3), and difficulty (Casual, Competitive, Pro), then start.

| Input | Action |
| --- | --- |
| WASD or arrow keys | Drive |
| Hold Space and turn | Drift. Release for a boost. The meter runs blue, then orange, then purple. |
| C | Cycle camera: Arcade, Low Close, Heli Far, Hood Cam |
| R | Reset |

Touch controls are available from the HUD.

## Two players

1. On the host machine, choose **Host LAN Room** and share the 4-digit code.
2. On the other device, open the Network URL, enter that code, and choose **Join**.
3. The host starts the race. Kart colors stay fixed: host is crimson and gold, the joining player is cyan and white.

Rooms use [PeerJS](https://peerjs.com/). Both devices need to reach the internet for the PeerJS broker, and they need to be on the same Wi-Fi for the game page itself.
