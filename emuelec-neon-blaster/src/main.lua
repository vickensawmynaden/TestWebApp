-- Neon Blaster: a small horizontal arcade shooter for EmuELEC / PortMaster (LÖVE 11.x).
-- Renders to a fixed 640x360 canvas and scales it to whatever screen the console uses.

local W, H = 640, 360
local lg = love.graphics

local canvas, fontSmall, fontBig, fontHuge
local sfx = {}
local state = "title"
local t = 0
local shake = 0
local highscore = 0
local quitHold = 0

local player, bullets, ebullets, enemies, particles, powerups, stars
local score, wave, waveTimer, spawnTimer, combo, comboTimer, banner, bannerTimer

---------------------------------------------------------------------------
-- Helpers
---------------------------------------------------------------------------
local function clamp(v, a, b) return math.max(a, math.min(b, v)) end
local function dist2(ax, ay, bx, by) local dx, dy = ax - bx, ay - by; return dx * dx + dy * dy end
local function rand(a, b) return a + love.math.random() * (b - a) end

local COLORS = {
  player = {0.2, 1.0, 0.9},
  bullet = {1.0, 1.0, 0.4},
  drifter = {1.0, 0.3, 0.6},
  chaser = {1.0, 0.6, 0.1},
  shooter = {0.6, 0.4, 1.0},
  boss = {1.0, 0.2, 0.2},
  ebullet = {1.0, 0.35, 0.35},
}

-- Draw a polygon with a cheap additive "glow" so it pops on a TV.
local function glowPoly(color, points)
  lg.setBlendMode("add")
  lg.setColor(color[1], color[2], color[3], 0.25)
  lg.setLineWidth(5)
  lg.polygon("line", points)
  lg.setLineWidth(2)
  lg.setColor(color[1], color[2], color[3], 1)
  lg.polygon("line", points)
  lg.setBlendMode("alpha")
end

local function rotated(x, y, angle, pts)
  local c, s, out = math.cos(angle), math.sin(angle), {}
  for i = 1, #pts, 2 do
    local px, py = pts[i], pts[i + 1]
    out[#out + 1] = x + px * c - py * s
    out[#out + 1] = y + px * s + py * c
  end
  return out
end

---------------------------------------------------------------------------
-- Procedural sound (no asset files needed)
---------------------------------------------------------------------------
local function makeSound(duration, fn)
  local rate = 22050
  local n = math.floor(duration * rate)
  local data = love.sound.newSoundData(n, rate, 16, 1)
  for i = 0, n - 1 do
    local p = i / n
    data:setSample(i, clamp(fn(i / rate, p), -1, 1))
  end
  return love.audio.newSource(data, "static")
end

local function square(phase) return (phase % 1) < 0.5 and 1 or -1 end

local function buildSounds()
  local ph = 0
  sfx.shoot = makeSound(0.08, function(tt, p)
    ph = ph + (900 - 600 * p) / 22050
    return square(ph) * 0.18 * (1 - p)
  end)
  sfx.explode = makeSound(0.45, function(tt, p)
    return (love.math.random() * 2 - 1) * 0.5 * (1 - p) ^ 2
  end)
  sfx.hit = makeSound(0.06, function(tt, p)
    return (love.math.random() * 2 - 1) * 0.3 * (1 - p)
  end)
  local ph2 = 0
  sfx.power = makeSound(0.35, function(tt, p)
    local notes = {523, 659, 784, 1047}
    ph2 = ph2 + notes[math.min(4, math.floor(p * 4) + 1)] / 22050
    return square(ph2) * 0.15 * (1 - p * 0.5)
  end)
  local ph3 = 0
  sfx.hurt = makeSound(0.5, function(tt, p)
    ph3 = ph3 + (300 - 250 * p) / 22050
    return (square(ph3) * 0.6 + (love.math.random() * 2 - 1) * 0.4) * 0.35 * (1 - p)
  end)
  local ph4 = 0
  sfx.bomb = makeSound(0.9, function(tt, p)
    ph4 = ph4 + (120 - 80 * p) / 22050
    return (math.sin(ph4 * math.pi * 2) * 0.5 + (love.math.random() * 2 - 1) * 0.4) * (1 - p)
  end)
  local ph5 = 0
  sfx.select = makeSound(0.1, function(tt, p)
    ph5 = ph5 + (p < 0.5 and 880 or 1320) / 22050
    return square(ph5) * 0.15
  end)
end

local function play(name)
  local s = sfx[name]
  if not s then return end
  local c = s:clone()
  c:play()
end

---------------------------------------------------------------------------
-- Input: keyboard, mapped gamepads, and raw (unmapped) joysticks.
---------------------------------------------------------------------------
local DEADZONE = 0.3

local function axisInput()
  local dx, dy = 0, 0
  if love.keyboard.isDown("left", "a") then dx = dx - 1 end
  if love.keyboard.isDown("right", "d") then dx = dx + 1 end
  if love.keyboard.isDown("up", "w") then dy = dy - 1 end
  if love.keyboard.isDown("down", "s") then dy = dy + 1 end
  for _, js in ipairs(love.joystick.getJoysticks()) do
    if js:isGamepad() then
      local ax, ay = js:getGamepadAxis("leftx"), js:getGamepadAxis("lefty")
      if math.abs(ax) > DEADZONE then dx = dx + ax end
      if math.abs(ay) > DEADZONE then dy = dy + ay end
      if js:isGamepadDown("dpleft") then dx = dx - 1 end
      if js:isGamepadDown("dpright") then dx = dx + 1 end
      if js:isGamepadDown("dpup") then dy = dy - 1 end
      if js:isGamepadDown("dpdown") then dy = dy + 1 end
    else
      if js:getAxisCount() >= 2 then
        local ax, ay = js:getAxis(1), js:getAxis(2)
        if math.abs(ax) > DEADZONE then dx = dx + ax end
        if math.abs(ay) > DEADZONE then dy = dy + ay end
      end
      if js:getHatCount() >= 1 then
        local h = js:getHat(1)
        if h:find("l") then dx = dx - 1 end
        if h:find("r") then dx = dx + 1 end
        if h:find("u") then dy = dy - 1 end
        if h:find("d") then dy = dy + 1 end
      end
    end
  end
  local len = math.sqrt(dx * dx + dy * dy)
  if len > 1 then dx, dy = dx / len, dy / len end
  return dx, dy
end

local function fireHeld()
  if love.keyboard.isDown("z", "space", "j") then return true end
  for _, js in ipairs(love.joystick.getJoysticks()) do
    if js:isGamepad() then
      if js:isGamepadDown("a", "y", "rightshoulder") then return true end
      if js:getGamepadAxis("triggerright") > 0.5 then return true end
    else
      if js:isDown(1, 4) then return true end
    end
  end
  return false
end

local function selectAndStartHeld()
  if love.keyboard.isDown("escape") then return true end
  for _, js in ipairs(love.joystick.getJoysticks()) do
    if js:isGamepad() and js:isGamepadDown("back") and js:isGamepadDown("start") then
      return true
    end
  end
  return false
end

---------------------------------------------------------------------------
-- Game setup
---------------------------------------------------------------------------
local function loadHighscore()
  local ok, contents = pcall(love.filesystem.read, "highscore.txt")
  if ok and contents then highscore = tonumber(contents) or 0 end
end

local function saveHighscore()
  pcall(love.filesystem.write, "highscore.txt", tostring(highscore))
end

local function initStars()
  stars = {}
  for i = 1, 120 do
    local layer = love.math.random(1, 3)
    stars[i] = {x = rand(0, W), y = rand(0, H), speed = 20 * layer * layer, size = layer * 0.6}
  end
end

local function newGame()
  player = {
    x = 80, y = H / 2, r = 7, speed = 190,
    lives = 3, bombs = 2, power = 1,
    cooldown = 0, invuln = 2, alive = true, respawn = 0,
  }
  bullets, ebullets, enemies, particles, powerups = {}, {}, {}, {}, {}
  score, combo, comboTimer = 0, 1, 0
  wave, waveTimer, spawnTimer = 1, 0, 1
  banner, bannerTimer = "WAVE 1", 2
end

local function burst(x, y, color, count, speed)
  for _ = 1, count do
    local a = rand(0, math.pi * 2)
    local s = rand(speed * 0.2, speed)
    particles[#particles + 1] = {
      x = x, y = y, vx = math.cos(a) * s, vy = math.sin(a) * s,
      life = rand(0.3, 0.8), max = 0.8, color = color, size = rand(1, 3),
    }
  end
end

---------------------------------------------------------------------------
-- Enemies
---------------------------------------------------------------------------
local function spawnEnemy(kind)
  local e = {kind = kind, x = W + 20, y = rand(30, H - 30), t = 0, hit = 0}
  if kind == "drifter" then
    e.hp, e.r, e.vx, e.amp, e.freq, e.score = 1, 9, -rand(90, 140) - wave * 5, rand(20, 60), rand(2, 4), 100
    e.baseY = e.y
  elseif kind == "chaser" then
    e.hp, e.r, e.speed, e.score = 2, 9, 80 + wave * 6, 150
  elseif kind == "shooter" then
    e.hp, e.r, e.vx, e.stopX, e.fire, e.score = 4, 12, -110, rand(W * 0.55, W * 0.85), rand(0.5, 1.5), 300
  elseif kind == "boss" then
    e.hp, e.r, e.vx, e.score = 60 + wave * 10, 34, -60, 5000
    e.maxhp, e.y, e.fire, e.pattern = e.hp, H / 2, 1.5, 0
  end
  enemies[#enemies + 1] = e
end

local function enemyFire(e, angle, speed)
  ebullets[#ebullets + 1] = {x = e.x, y = e.y, vx = math.cos(angle) * speed, vy = math.sin(angle) * speed, r = 3}
end

local function updateEnemy(e, dt)
  e.t = e.t + dt
  e.hit = math.max(0, e.hit - dt)
  if e.kind == "drifter" then
    e.x = e.x + e.vx * dt
    e.y = e.baseY + math.sin(e.t * e.freq) * e.amp
  elseif e.kind == "chaser" then
    local tx, ty = player.alive and player.x or 0, player.alive and player.y or H / 2
    local a = math.atan2(ty - e.y, tx - e.x)
    e.x = e.x + math.cos(a) * e.speed * dt - 30 * dt
    e.y = e.y + math.sin(a) * e.speed * dt
  elseif e.kind == "shooter" then
    if e.x > e.stopX then e.x = e.x + e.vx * dt end
    e.fire = e.fire - dt
    if e.fire <= 0 and player.alive then
      e.fire = math.max(0.8, 2.2 - wave * 0.1)
      enemyFire(e, math.atan2(player.y - e.y, player.x - e.x), 150)
    end
    if e.t > 12 then e.x = e.x - 160 * dt end
  elseif e.kind == "boss" then
    if e.x > W - 90 then e.x = e.x + e.vx * dt end
    e.y = H / 2 + math.sin(e.t * 0.8) * (H / 2 - 60)
    e.fire = e.fire - dt
    if e.fire <= 0 then
      e.pattern = (e.pattern + 1) % 3
      if e.pattern == 0 then
        for i = -4, 4 do enemyFire(e, math.pi + i * 0.18, 140) end
        e.fire = 1.6
      elseif e.pattern == 1 and player.alive then
        local a = math.atan2(player.y - e.y, player.x - e.x)
        for i = -1, 1 do enemyFire(e, a + i * 0.12, 200) end
        e.fire = 0.9
      else
        for i = 0, 15 do enemyFire(e, e.t + i * math.pi / 8, 110) end
        e.fire = 2.0
      end
    end
  end
end

local function drawEnemy(e)
  local c = COLORS[e.kind]
  if e.hit > 0 then c = {1, 1, 1} end
  if e.kind == "drifter" then
    glowPoly(c, rotated(e.x, e.y, e.t * 3, {-9, 0, 0, -9, 9, 0, 0, 9}))
  elseif e.kind == "chaser" then
    local a = math.atan2(player.y - e.y, player.x - e.x)
    glowPoly(c, rotated(e.x, e.y, a, {10, 0, -8, -8, -4, 0, -8, 8}))
  elseif e.kind == "shooter" then
    local pts = {}
    for i = 0, 5 do
      local a = i * math.pi / 3 + e.t
      pts[#pts + 1] = e.x + math.cos(a) * 12
      pts[#pts + 1] = e.y + math.sin(a) * 12
    end
    glowPoly(c, pts)
    lg.setColor(c[1], c[2], c[3], 1)
    lg.circle("fill", e.x, e.y, 3)
  elseif e.kind == "boss" then
    local pts = {}
    for i = 0, 7 do
      local a = i * math.pi / 4 + math.sin(e.t) * 0.2
      local r = (i % 2 == 0) and 36 or 24
      pts[#pts + 1] = e.x + math.cos(a) * r
      pts[#pts + 1] = e.y + math.sin(a) * r
    end
    glowPoly(c, pts)
    glowPoly(c, rotated(e.x, e.y, -e.t * 2, {-12, 0, 0, -12, 12, 0, 0, 12}))
  end
end

---------------------------------------------------------------------------
-- Player actions
---------------------------------------------------------------------------
local function fire()
  local p = player
  local function shot(dy, vy)
    bullets[#bullets + 1] = {x = p.x + 10, y = p.y + dy, vx = 420, vy = vy or 0}
  end
  if p.power == 1 then
    shot(0)
  elseif p.power == 2 then
    shot(-4); shot(4)
  else
    shot(0); shot(-4, -70); shot(4, 70)
  end
  p.cooldown = 0.12
  play("shoot")
end

local function useBomb()
  if not player.alive or player.bombs <= 0 then return end
  player.bombs = player.bombs - 1
  ebullets = {}
  shake = 0.6
  play("bomb")
  burst(player.x, player.y, {1, 1, 1}, 60, 400)
  for _, e in ipairs(enemies) do
    e.hp = e.hp - (e.kind == "boss" and 15 or 99)
    e.hit = 0.2
  end
end

local function killPlayer()
  if player.invuln > 0 or not player.alive then return end
  player.alive = false
  player.lives = player.lives - 1
  player.power = math.max(1, player.power - 1)
  player.respawn = 1.5
  combo = 1
  shake = 0.5
  play("hurt")
  burst(player.x, player.y, COLORS.player, 50, 250)
  if player.lives < 0 then
    state = "gameover"
    if score > highscore then
      highscore = score
      saveHighscore()
    end
  end
end

---------------------------------------------------------------------------
-- LÖVE callbacks
---------------------------------------------------------------------------
function love.load()
  love.mouse.setVisible(false)
  lg.setDefaultFilter("linear", "linear")
  canvas = lg.newCanvas(W, H)
  fontSmall = lg.newFont(12)
  fontBig = lg.newFont(24)
  fontHuge = lg.newFont(48)
  love.math.setRandomSeed(os.time())
  buildSounds()
  loadHighscore()
  initStars()
  newGame()
end

local function updateStars(dt, mult)
  for _, s in ipairs(stars) do
    s.x = s.x - s.speed * mult * dt
    if s.x < 0 then s.x, s.y = W, rand(0, H) end
  end
end

local function updatePlay(dt)
  -- Waves: a timed stream of mixed enemies, with a boss every 5th wave.
  waveTimer = waveTimer + dt
  bannerTimer = math.max(0, bannerTimer - dt)
  local bossWave = wave % 5 == 0
  if bossWave then
    if waveTimer > 0.1 and waveTimer - dt <= 0.1 then spawnEnemy("boss") end
    local bossAlive = false
    for _, e in ipairs(enemies) do if e.kind == "boss" then bossAlive = true end end
    if waveTimer > 1 and not bossAlive then
      wave, waveTimer = wave + 1, 0
      banner, bannerTimer = "WAVE " .. wave, 2
    end
  else
    spawnTimer = spawnTimer - dt
    if spawnTimer <= 0 and waveTimer < 20 then
      spawnTimer = math.max(0.35, 1.3 - wave * 0.08)
      local roll = love.math.random()
      if roll < 0.55 then
        local y = rand(40, H - 40)
        for i = 0, 2 do
          spawnEnemy("drifter")
          enemies[#enemies].x = W + 20 + i * 28
          enemies[#enemies].baseY = y
        end
      elseif roll < 0.8 then
        spawnEnemy("chaser")
      else
        spawnEnemy("shooter")
      end
    end
    if waveTimer >= 20 and #enemies == 0 then
      wave, waveTimer = wave + 1, 0
      banner = (wave % 5 == 0) and "WARNING: BOSS" or ("WAVE " .. wave)
      bannerTimer = 2
    end
  end

  -- Player
  local p = player
  if p.alive then
    local dx, dy = axisInput()
    p.x = clamp(p.x + dx * p.speed * dt, 12, W - 12)
    p.y = clamp(p.y + dy * p.speed * dt, 12, H - 12)
    p.cooldown = p.cooldown - dt
    p.invuln = math.max(0, p.invuln - dt)
    if fireHeld() and p.cooldown <= 0 then fire() end
  elseif p.lives >= 0 then
    p.respawn = p.respawn - dt
    if p.respawn <= 0 then
      p.alive, p.x, p.y, p.invuln = true, 80, H / 2, 2.5
    end
  end

  comboTimer = comboTimer - dt
  if comboTimer <= 0 then combo = 1 end

  -- Bullets
  for i = #bullets, 1, -1 do
    local b = bullets[i]
    b.x, b.y = b.x + b.vx * dt, b.y + b.vy * dt
    local remove = b.x > W + 10 or b.y < -10 or b.y > H + 10
    if not remove then
      for _, e in ipairs(enemies) do
        if e.hp > 0 and dist2(b.x, b.y, e.x, e.y) < (e.r + 3) ^ 2 then
          e.hp, e.hit, remove = e.hp - 1, 0.06, true
          burst(b.x, b.y, COLORS.bullet, 3, 80)
          play("hit")
          break
        end
      end
    end
    if remove then table.remove(bullets, i) end
  end

  for i = #ebullets, 1, -1 do
    local b = ebullets[i]
    b.x, b.y = b.x + b.vx * dt, b.y + b.vy * dt
    if p.alive and dist2(b.x, b.y, p.x, p.y) < (b.r + p.r - 3) ^ 2 then
      killPlayer()
      table.remove(ebullets, i)
    elseif b.x < -10 or b.x > W + 10 or b.y < -10 or b.y > H + 10 then
      table.remove(ebullets, i)
    end
  end

  -- Enemies
  for i = #enemies, 1, -1 do
    local e = enemies[i]
    updateEnemy(e, dt)
    if e.hp <= 0 then
      score = score + e.score * combo
      combo = math.min(8, combo + 1)
      comboTimer = 1.5
      local big = e.kind == "boss"
      burst(e.x, e.y, COLORS[e.kind], big and 120 or 25, big and 350 or 180)
      shake = math.max(shake, big and 0.8 or 0.12)
      play("explode")
      if big or love.math.random() < 0.08 then
        powerups[#powerups + 1] = {x = e.x, y = e.y, t = 0, kind = (love.math.random() < 0.7 or big) and "P" or "B"}
      end
      table.remove(enemies, i)
    elseif e.x < -50 then
      table.remove(enemies, i)
    elseif p.alive and dist2(e.x, e.y, p.x, p.y) < (e.r + p.r - 2) ^ 2 then
      killPlayer()
      if e.kind ~= "boss" then e.hp = 0 end
    end
  end

  -- Power-ups
  for i = #powerups, 1, -1 do
    local u = powerups[i]
    u.t = u.t + dt
    u.x = u.x - 50 * dt
    if p.alive and dist2(u.x, u.y, p.x, p.y) < 18 ^ 2 then
      if u.kind == "P" then p.power = math.min(3, p.power + 1) else p.bombs = math.min(5, p.bombs + 1) end
      score = score + 250
      play("power")
      table.remove(powerups, i)
    elseif u.x < -20 then
      table.remove(powerups, i)
    end
  end
end

function love.update(dt)
  dt = math.min(dt, 1 / 30)
  t = t + dt
  shake = math.max(0, shake - dt)

  -- Hold Select+Start (or Esc) for a moment to quit back to EmulationStation.
  if selectAndStartHeld() then
    quitHold = quitHold + dt
    if quitHold > 0.6 then love.event.quit() end
  else
    quitHold = 0
  end

  updateStars(dt, state == "play" and 1 or 0.4)

  for i = #particles, 1, -1 do
    local pt = particles[i]
    pt.x, pt.y = pt.x + pt.vx * dt, pt.y + pt.vy * dt
    pt.vx, pt.vy = pt.vx * 0.96, pt.vy * 0.96
    pt.life = pt.life - dt
    if pt.life <= 0 then table.remove(particles, i) end
  end

  if state == "play" then updatePlay(dt) end
end

---------------------------------------------------------------------------
-- Button presses (menus, bomb, pause)
---------------------------------------------------------------------------
local function pressConfirm()
  if state == "title" or state == "gameover" then
    newGame()
    state = "play"
    play("select")
  elseif state == "pause" then
    state = "play"
  end
end

local function pressStart()
  if state == "play" then
    state = "pause"
    play("select")
  else
    pressConfirm()
  end
end

local function pressBomb()
  if state == "play" then useBomb() end
end

function love.keypressed(key)
  if key == "return" or key == "p" then pressStart()
  elseif key == "z" or key == "space" then if state ~= "play" then pressConfirm() end
  elseif key == "x" or key == "k" then pressBomb()
  end
end

function love.gamepadpressed(js, button)
  if button == "start" then pressStart()
  elseif button == "a" then if state ~= "play" then pressConfirm() end
  elseif button == "b" or button == "x" or button == "leftshoulder" then pressBomb()
  end
end

-- Fallback for controllers SDL does not recognise: guess a sensible layout.
function love.joystickpressed(js, button)
  if js:isGamepad() then return end
  if button == 1 or button == 4 then
    if state ~= "play" then pressConfirm() end
  elseif button == 2 or button == 3 then
    pressBomb()
  elseif button >= 8 then
    pressStart()
  end
end

---------------------------------------------------------------------------
-- Drawing
---------------------------------------------------------------------------
local function printCenter(text, font, y, color)
  lg.setFont(font)
  lg.setColor(color or {1, 1, 1})
  lg.printf(text, 0, y, W, "center")
end

local function drawWorld()
  -- Stars
  for _, s in ipairs(stars) do
    local b = 0.15 + s.size * 0.25
    lg.setColor(b * 0.8, b * 0.9, b + 0.15, 1)
    lg.rectangle("fill", s.x, s.y, s.size * (state == "play" and 3 or 1.5), s.size)
  end

  -- Grid floor/ceiling for a synthwave feel
  lg.setColor(0.4, 0.1, 0.6, 0.35)
  lg.setLineWidth(1)
  local off = (t * 60) % 40
  for x = -off, W, 40 do
    lg.line(x, H - 2, x, H - 14)
    lg.line(x, 2, x, 14)
  end
  lg.line(0, H - 14, W, H - 14)
  lg.line(0, 14, W, 14)

  for _, u in ipairs(powerups) do
    local c = u.kind == "P" and {0.3, 1, 0.4} or {1, 0.9, 0.2}
    local s = 8 + math.sin(u.t * 8) * 1.5
    glowPoly(c, {u.x - s, u.y - s, u.x + s, u.y - s, u.x + s, u.y + s, u.x - s, u.y + s})
    lg.setFont(fontSmall)
    lg.setColor(c)
    lg.printf(u.kind, u.x - 10, u.y - 7, 20, "center")
  end

  for _, e in ipairs(enemies) do drawEnemy(e) end

  lg.setBlendMode("add")
  for _, b in ipairs(bullets) do
    lg.setColor(1, 0.9, 0.2, 0.5)
    lg.rectangle("fill", b.x - 10, b.y - 3, 18, 6)
    lg.setColor(1, 1, 0.6, 1)
    lg.rectangle("fill", b.x - 8, b.y - 1.5, 14, 3)
  end
  for _, b in ipairs(ebullets) do
    lg.setColor(1, 0.3, 0.3, 0.35)
    lg.circle("fill", b.x, b.y, b.r + 3)
    lg.setColor(1, 0.8, 0.8, 1)
    lg.circle("fill", b.x, b.y, b.r)
  end
  for _, pt in ipairs(particles) do
    local c = pt.color
    lg.setColor(c[1], c[2], c[3], pt.life / pt.max)
    lg.rectangle("fill", pt.x, pt.y, pt.size, pt.size)
  end
  lg.setBlendMode("alpha")

  local p = player
  if p.alive and (p.invuln <= 0 or math.floor(t * 15) % 2 == 0) then
    local flame = 6 + math.sin(t * 40) * 3
    glowPoly({1, 0.5, 0.1}, {p.x - 8, p.y - 3, p.x - 8 - flame, p.y, p.x - 8, p.y + 3})
    glowPoly(COLORS.player, {p.x + 12, p.y, p.x - 8, p.y - 8, p.x - 4, p.y, p.x - 8, p.y + 8})
  end
end

local function drawHUD()
  lg.setFont(fontSmall)
  lg.setColor(1, 1, 1)
  lg.print(string.format("SCORE %08d", score), 10, 18)
  lg.printf(string.format("HI %08d", math.max(highscore, score)), 0, 18, W - 10, "right")
  lg.setColor(COLORS.player)
  lg.print("SHIPS " .. string.rep("> ", math.max(0, player.lives)), 10, H - 30)
  lg.setColor(1, 0.9, 0.2)
  lg.print("BOMBS " .. string.rep("* ", player.bombs), 140, H - 30)
  lg.setColor(0.3, 1, 0.4)
  lg.print("POWER " .. player.power, 260, H - 30)
  if combo > 1 then
    lg.setColor(1, 0.4, 0.8)
    lg.printf("x" .. combo .. " COMBO", 0, H - 30, W - 10, "right")
  end
  lg.setColor(1, 1, 1, 0.6)
  lg.printf("WAVE " .. wave, 0, 18, W, "center")

  for _, e in ipairs(enemies) do
    if e.kind == "boss" then
      lg.setColor(0.3, 0.05, 0.05)
      lg.rectangle("fill", W / 2 - 150, 36, 300, 6)
      lg.setColor(1, 0.2, 0.2)
      lg.rectangle("fill", W / 2 - 150, 36, 300 * math.max(0, e.hp) / e.maxhp, 6)
    end
  end

  if bannerTimer > 0 then
    local a = math.min(1, bannerTimer)
    printCenter(banner, fontBig, H / 2 - 50, {1, 1, 1, a})
  end
end

local function drawScene()
  lg.clear(0.02, 0.01, 0.06)
  drawWorld()

  if state == "title" then
    local pulse = 0.7 + math.sin(t * 3) * 0.3
    printCenter("NEON BLASTER", fontHuge, 90, {0.2, 1, 0.9})
    printCenter("HI SCORE " .. highscore, fontSmall, 160, {1, 1, 1, 0.8})
    printCenter("PRESS  A  /  START", fontBig, 210, {1, 0.4, 0.8, pulse})
    printCenter("D-PAD/STICK move   A fire   B bomb   START pause", fontSmall, 290, {0.8, 0.8, 1})
    printCenter("Hold SELECT + START to exit", fontSmall, 310, {0.6, 0.6, 0.8})
  elseif state == "play" then
    drawHUD()
  elseif state == "pause" then
    drawHUD()
    lg.setColor(0, 0, 0, 0.6)
    lg.rectangle("fill", 0, 0, W, H)
    printCenter("PAUSED", fontHuge, 120, {1, 1, 1})
    printCenter("START to resume  -  hold SELECT + START to exit", fontSmall, 200, {0.8, 0.8, 1})
  elseif state == "gameover" then
    drawHUD()
    lg.setColor(0, 0, 0, 0.5)
    lg.rectangle("fill", 0, 0, W, H)
    printCenter("GAME OVER", fontHuge, 100, {1, 0.3, 0.4})
    printCenter("SCORE " .. score, fontBig, 170, {1, 1, 1})
    if score >= highscore and score > 0 then
      printCenter("NEW HIGH SCORE!", fontBig, 205, {1, 0.9, 0.2, 0.6 + math.sin(t * 6) * 0.4})
    end
    printCenter("PRESS  A  /  START  TO PLAY AGAIN", fontSmall, 260, {1, 0.4, 0.8})
  end
end

function love.draw()
  lg.setCanvas(canvas)
  local sx, sy = 0, 0
  if shake > 0 then sx, sy = rand(-4, 4) * shake, rand(-4, 4) * shake end
  lg.push()
  lg.translate(sx, sy)
  drawScene()
  lg.pop()
  lg.setCanvas()

  -- Scale the 640x360 canvas to fit the screen, letterboxing if needed.
  local sw, sh = lg.getDimensions()
  local scale = math.min(sw / W, sh / H)
  lg.clear(0, 0, 0)
  lg.setColor(1, 1, 1, 1)
  lg.draw(canvas, math.floor((sw - W * scale) / 2), math.floor((sh - H * scale) / 2), 0, scale, scale)
end
