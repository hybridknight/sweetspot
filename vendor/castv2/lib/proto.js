var fs        = require('fs');
var protobuf  = require("protobufjs");

var root = protobuf.loadSync(__dirname + "/cast_channel.proto");

var messages = [
  'CastMessage',
  'AuthChallenge',
  'AuthResponse',
  'AuthError',
  'DeviceAuthMessage'
];

var extensions = [];

function onLoad(root) {

  messages.forEach(function(message) {
    extensions[message] =
      root.lookupType(`extensions.api.cast_channel.${message}`);
  });
}

onLoad(root);

messages.forEach(function(message) {
  module.exports[message] = {
    serialize: function(data) {
      if (!extensions[message]) {
        throw new Error('extension not loaded yet');
      }
      var Message = extensions[message];
      return Message.encode(data).finish();
    },
    parse: function(data) {
      if (!extensions[message]) {
        throw new Error('extension not loaded yet');
      }
      var Message = extensions[message];
      return Message.decode(data);
    }
  };
});
