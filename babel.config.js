module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    // react-native-worklets/plugin replaces the Reanimated plugin in Reanimated 4.
    // MUST be the last plugin — earlier plugins above it will silently fail at runtime.
    plugins: ['react-native-worklets/plugin'],
  };
};
