module.exports = (api) => {
  api.cache(true);

  const presets = [
    [
      '@babel/preset-env',
      {
        targets: {
          node: 'current'
        }
      }
    ]
  ];

  const plugins = [
    ['@babel/plugin-transform-spread', { loose: true }]
  ];

  return { presets, plugins };
};
