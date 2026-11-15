// The chosen sidekick: the LED matrix dither blob, without the drips, with the agent layer on top.
Roamie.register(Roamie.ditherKit({
  id: 'sidekick', label: 'Sidekick', matrix: true, pixel: 1.3, glow: 0.55, speed: 80,
  pal: [[8, 10, 12], [70, 76, 84], [150, 158, 168], [214, 220, 228], [255, 255, 255]],
  plugin: (kit) => Roamie.agentPlugin?.(kit) ?? null,
}));
