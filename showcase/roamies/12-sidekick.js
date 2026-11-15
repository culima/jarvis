// The chosen sidekick: the LED matrix dither blob, without the drips, with the agent layer on top.
Roamie.register(Roamie.ditherKit({
  id: 'sidekick', label: 'Sidekick', matrix: true, pixel: 1.3, glow: 0.55, speed: 80,
  pal: Roamie.theme.pal([[4, 16, 18], [14, 92, 96], [40, 196, 184], [120, 255, 226], [230, 255, 250]]), // follows the user's colour (theme.js)
  plugin: (kit) => Roamie.agentPlugin?.(kit) ?? null,
}));
