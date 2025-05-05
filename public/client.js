window.TrelloPowerUp.initialize({
    'card-buttons': function(t, options) {
      return [{
        icon: 'https://example.com/icon.png',
        text: 'Contoh Tombol',
        callback: function(t) {
          return t.popup({
            title: 'Popup Contoh',
            url: 'popup.html'
          });
        }
      }];
    }
  });
  