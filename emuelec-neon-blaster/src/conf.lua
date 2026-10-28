function love.conf(t)
  t.identity = "neonblaster"
  t.version = "11.5"
  t.window.title = "Neon Blaster"
  t.window.width = 1280
  t.window.height = 720
  t.window.fullscreen = true
  t.window.fullscreentype = "desktop"
  t.window.vsync = 1
  t.modules.physics = false
  t.modules.video = false
  t.modules.touch = false
end
