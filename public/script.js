document.addEventListener('DOMContentLoaded', async () => {
  let ipinfoToken = '';
  let weatherApiKey = '';
  let opencageApiKey = '';
  let unsplashApiKey = '';
  
  try {
    const configResponse = await fetch('/api/config');
    const config = await configResponse.json();
    ipinfoToken = config.IPINFO_TOKEN;
    weatherApiKey = config.WEATHER_API_KEY;
    opencageApiKey = config.OPENCAGE_API_KEY;
    unsplashApiKey = config.UNSPLASH_API_KEY;
  } catch (err) {
    console.error('Failed to load config', err);
  }
  
  // Navigation elements
  const navBtns = document.querySelectorAll('.nav-btn');
  const pageSections = document.querySelectorAll('.page-section');
  const bgVideo = document.getElementById('bg-video');
  
  // Home elements
  const locationLoading = document.getElementById('location-loading');
  const locationDisplay = document.getElementById('location-display');
  const stateNameEl = document.getElementById('state-name');
  const cropSelection = document.getElementById('crop-selection');
  const cropDropdown = document.getElementById('crop-dropdown');
  const cropDetails = document.getElementById('crop-details');
  
  let cropsData = [];
  let userCoords = { lat: 20.5937, lng: 78.9629 }; // Default India center
  let userState = null;
  let mapInitialized = false;
  let leafletMap = null;

  // SPA Navigation
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Remove active from all
      navBtns.forEach(b => b.classList.remove('active'));
      pageSections.forEach(s => s.classList.add('hidden'));
      
      // Add active to clicked
      btn.classList.add('active');
      const targetId = btn.getAttribute('data-target');
      const bgSrc = btn.getAttribute('data-bg');
      
      // Update background video
      const bgImg = document.getElementById('bg-image');
      if (bgImg) bgImg.classList.add('hidden'); // Hide image on tab switch

      if (bgVideo && bgSrc) {
        const sourceEl = bgVideo.querySelector('source');
        if (sourceEl.getAttribute('src') !== bgSrc) {
          bgVideo.style.opacity = '0';
          setTimeout(() => {
            sourceEl.setAttribute('src', bgSrc);
            bgVideo.load();
            bgVideo.play().catch(e => console.log('Auto-play prevented:', e));
            bgVideo.style.opacity = '1';
          }, 400); // wait for fade out
        } else {
          bgVideo.style.opacity = '1';
          bgVideo.play().catch(e => console.log('Auto-play prevented:', e));
        }
      }

      document.getElementById(targetId).classList.remove('hidden');

      // Initialize map only when it becomes visible to fix sizing issues
      if (targetId === 'map-section') {
        if (!mapInitialized) {
          initMap();
          mapInitialized = true;
        } else {
          // Invalidate size to prevent grey tiles bug when unhiding
          setTimeout(() => { leafletMap.invalidateSize(); }, 100);
        }
      }
    });
  });

  // Step 1: Auto-detect location
  async function detectLocation() {
    locationLoading.textContent = 'Requesting exact location access...';
    
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          userCoords.lat = position.coords.latitude;
          userCoords.lng = position.coords.longitude;
          fetchWeatherData(userCoords.lat, userCoords.lng); // Fetch weather data with coords
          
          try {
            locationLoading.textContent = 'Reverse geocoding...';
            const geocodeUrl = `https://api.opencagedata.com/geocode/v1/json?q=${userCoords.lat}+${userCoords.lng}&key=${opencageApiKey}`;
            const response = await fetch(geocodeUrl);
            if (!response.ok) throw new Error('Geocoding failed');
            
            const data = await response.json();
            
            if (data.results && data.results.length > 0) {
              const components = data.results[0].components;
              userState = components.state;
              if (!userState) throw new Error('State not found in geocoding data');
              updateLocationDisplay(userState);
            } else {
              throw new Error('No geocoding results found');
            }
          } catch (error) {
            console.error('Geocoding error, falling back to IP:', error);
            fallbackToIpInfo();
          }
        },
        (error) => {
          console.warn('Geolocation denied or failed, falling back to IP:', error.message);
          fallbackToIpInfo();
        },
        { timeout: 10000 }
      );
    } else {
      console.warn('Geolocation not supported, falling back to IP');
      fallbackToIpInfo();
    }
  }

  async function fallbackToIpInfo() {
    locationLoading.textContent = 'Detecting state via IP...';
    try {
      const response = await fetch(`https://ipinfo.io/json?token=${ipinfoToken}`);
      if (!response.ok) throw new Error('Failed to fetch location data');
      
      const data = await response.json();
      userState = data.region; 
      
      // Attempt to get coords from ipinfo for weather
      if (data.loc) {
        const [lat, lng] = data.loc.split(',');
        userCoords = { lat: parseFloat(lat), lng: parseFloat(lng) };
        fetchWeatherData(userCoords.lat, userCoords.lng);
      }
      
      updateLocationDisplay(userState);
    } catch (error) {
      console.error('Error detecting location:', error);
      locationLoading.textContent = 'Unable to detect location automatically.';
      locationLoading.style.color = '#ef4444';
      locationLoading.style.animation = 'none';
    }
  }

  function updateLocationDisplay(state) {
    locationLoading.classList.add('hidden');
    locationDisplay.classList.remove('hidden');
    stateNameEl.textContent = state;
    fetchCropsByState(state, true); // true indicates it's for Home page
  }

  // Manual Location Logic
  const editLocBtn = document.getElementById('edit-user-location-btn');
  const manualLocInputContainer = document.getElementById('manual-location-input');
  const manualStateInput = document.getElementById('manual-state-name');
  const saveLocBtn = document.getElementById('save-user-location-btn');

  if (editLocBtn && manualLocInputContainer) {
    editLocBtn.addEventListener('click', () => {
      manualLocInputContainer.classList.toggle('hidden');
      if (!manualLocInputContainer.classList.contains('hidden')) {
        manualStateInput.focus();
        manualStateInput.value = userState || '';
      }
    });

    saveLocBtn.addEventListener('click', () => {
      const newState = manualStateInput.value.trim();
      if (newState) {
        userState = newState;
        updateLocationDisplay(userState);
        manualLocInputContainer.classList.add('hidden');
        
        // Update weather to match new location
        if (typeof searchCityWeather === 'function') {
          searchCityWeather(newState, false);
          const citySearchInput = document.getElementById('city-search');
          if (citySearchInput) {
            citySearchInput.value = newState;
          }
        }
      }
    });

    manualStateInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        saveLocBtn.click();
      }
    });
  }

  // Fetch crops
  async function fetchCropsByState(state, isHome = false) {
    try {
      const response = await fetch(`http://localhost:5000/api/crops/state/${encodeURIComponent(state)}`);
      if (!response.ok) throw new Error('Failed to fetch crops');
      
      const crops = await response.json();
      
      if (isHome) {
        cropsData = crops;
        cropDropdown.innerHTML = '<option value="" disabled selected>Choose a crop...</option>';
        if (crops.length === 0) {
          const option = document.createElement('option');
          option.textContent = `No crops found for ${state}`;
          option.disabled = true;
          cropDropdown.appendChild(option);
        } else {
          crops.forEach(crop => {
            const option = document.createElement('option');
            option.value = crop.id;
            option.textContent = crop.name;
            cropDropdown.appendChild(option);
          });
        }
        cropSelection.classList.remove('hidden');
        cropDropdown.addEventListener('change', handleCropSelection);
      } else {
        // Map Page Rendering
        renderMapCrops(state, crops);
      }
      
    } catch (error) {
      console.error('Error fetching crops:', error);
    }
  }

  function handleCropSelection(event) {
    const selectedId = event.target.value;
    const crop = cropsData.find(c => c.id.toString() === selectedId);
    if (crop) renderCropDetails(crop);
  }

  function renderCropDetails(crop) {
    document.getElementById('detail-name').textContent = crop.name;
    document.getElementById('detail-quality').textContent = crop.quality || 'N/A';
    document.getElementById('detail-weather').textContent = crop.ideal_weather || 'N/A';
    document.getElementById('detail-water').textContent = crop.water_required || 'N/A';
    document.getElementById('detail-density').textContent = crop.soil_density || 'N/A';
    document.getElementById('detail-soil').textContent = crop.soil_type || 'N/A';
    
    const statesList = document.getElementById('detail-states');
    statesList.innerHTML = '';
    
    if (crop.states && Array.isArray(crop.states)) {
      crop.states.forEach(s => {
        const badge = document.createElement('span');
        badge.className = 'state-badge';
        badge.textContent = s;
        statesList.appendChild(badge);
      });
    }
    cropDetails.classList.remove('hidden');
    
    // Trigger animation
    cropDetails.classList.remove('animate-pop');
    void cropDetails.offsetWidth; // trigger reflow
    cropDetails.classList.add('animate-pop');
  }

  // --- MAP EXPLORER LOGIC ---
  async function initMap() {
    leafletMap = L.map('india-map').setView([20.5937, 78.9629], 5); // India center

    // Dark theme map tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(leafletMap);

    // Add user marker if we have coords
    if (userCoords) {
      const userIcon = L.divIcon({
        className: 'custom-user-marker',
        html: '<div style="background-color: #3B82F6; width: 16px; height: 16px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 0 10px #3B82F6;"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });
      L.marker([userCoords.lat, userCoords.lng], { icon: userIcon }).addTo(leafletMap)
        .bindPopup('<b>You are here</b>')
        .openPopup();
    }

    // Load India GeoJSON
    try {
      const geoResp = await fetch('https://cdn.jsdelivr.net/gh/geohacker/india/state/india_state.geojson');
      const geoData = await geoResp.json();
      
      L.geoJSON(geoData, {
        style: function (feature) {
          return {
            color: "#10B981",
            weight: 1,
            fillColor: "#059669",
            fillOpacity: 0.2
          };
        },
        onEachFeature: function (feature, layer) {
          layer.on({
            mouseover: function (e) {
              const layer = e.target;
              layer.setStyle({
                fillOpacity: 0.5,
                weight: 2
              });
            },
            mouseout: function (e) {
              const layer = e.target;
              layer.setStyle({
                fillOpacity: 0.2,
                weight: 1
              });
            },
            click: function (e) {
              // The property in geohacker geojson for state name is NAME_1
              const stateName = feature.properties.NAME_1;
              fetchCropsByState(stateName, false);
            }
          });
        }
      }).addTo(leafletMap);
    } catch (err) {
      console.error("Failed to load map geojson", err);
    }
  }

  function renderMapCrops(state, crops) {
    document.getElementById('map-state-title').textContent = `Crops in ${state}`;
    const listEl = document.getElementById('map-crop-list');
    listEl.innerHTML = '';
    
    if (crops.length === 0) {
      listEl.innerHTML = '<p>No crops found for this state in the database.</p>';
    } else {
      crops.forEach(crop => {
        const card = document.createElement('div');
        card.className = 'map-crop-card';
        card.innerHTML = `
          <h3>${crop.name}</h3>
          <p><strong>Weather:</strong> ${crop.ideal_weather}</p>
          <p><strong>Water:</strong> ${crop.water_required}</p>
          <p><strong>Soil:</strong> ${crop.soil_type}</p>
        `;
        listEl.appendChild(card);
      });
    }
    document.getElementById('map-crop-results').classList.remove('hidden');
  }

  // --- LIVE WEATHER LOGIC ---
  async function fetchWeatherData(lat, lng) {
    try {
      const response = await fetch(`http://api.weatherapi.com/v1/current.json?key=${weatherApiKey}&q=${lat},${lng}`);
      if (!response.ok) throw new Error("Weather API failed");
      
      const data = await response.json();
      
      document.getElementById('w-location').textContent = `${data.location.name}, ${data.location.region}`;
      document.getElementById('w-icon').src = `https:${data.current.condition.icon}`;
      document.getElementById('w-temp').textContent = data.current.temp_c;
      document.getElementById('w-condition').textContent = data.current.condition.text;
      
      document.getElementById('w-humidity').textContent = `${data.current.humidity}%`;
      document.getElementById('w-wind').textContent = `${data.current.wind_kph} km/h`;
      document.getElementById('w-feels').textContent = `${data.current.feelslike_c}°C`;
      document.getElementById('w-precip').textContent = `${data.current.precip_mm} mm`;
      
      document.getElementById('weather-loading').classList.add('hidden');
      document.getElementById('weather-dashboard').classList.remove('hidden');
      
    } catch (error) {
      console.error("Weather fetch error", error);
      document.getElementById('weather-loading').textContent = "Failed to load weather data.";
    }
  }

  // --- CITY SEARCH & UNSPLASH LOGIC ---
  const citySearchInput = document.getElementById('city-search');
  const citySearchBtn = document.getElementById('city-search-btn');
  const bgImage = document.getElementById('bg-image');

  async function searchCityWeather(city, updateBackground = true) {
    if (!city) return;
    document.getElementById('weather-loading').classList.remove('hidden');
    document.getElementById('weather-loading').textContent = `Fetching weather for ${city}...`;
    document.getElementById('weather-dashboard').classList.add('hidden');

    try {
      // Fetch Weather
      const response = await fetch(`http://api.weatherapi.com/v1/current.json?key=${weatherApiKey}&q=${encodeURIComponent(city)}`);
      if (!response.ok) throw new Error("Weather API failed");
      const data = await response.json();
      
      document.getElementById('w-location').textContent = `${data.location.name}, ${data.location.region}`;
      document.getElementById('w-icon').src = `https:${data.current.condition.icon}`;
      document.getElementById('w-temp').textContent = data.current.temp_c;
      document.getElementById('w-condition').textContent = data.current.condition.text;
      
      document.getElementById('w-humidity').textContent = `${data.current.humidity}%`;
      document.getElementById('w-wind').textContent = `${data.current.wind_kph} km/h`;
      document.getElementById('w-feels').textContent = `${data.current.feelslike_c}°C`;
      document.getElementById('w-precip').textContent = `${data.current.precip_mm} mm`;
      
      document.getElementById('weather-loading').classList.add('hidden');
      document.getElementById('weather-dashboard').classList.remove('hidden');

      // Fetch Unsplash Image
      if (updateBackground) {
        fetchUnsplashImage(city);
      }

    } catch (error) {
      console.error("Weather search error", error);
      document.getElementById('weather-loading').textContent = "Failed to load weather data for this city.";
    }
  }

  async function fetchUnsplashImage(city) {
    try {
      const response = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(city)}&client_id=${unsplashApiKey}&orientation=landscape`);
      if (!response.ok) throw new Error("Unsplash API failed");
      const data = await response.json();

      if (data.results && data.results.length > 0) {
        bgImage.src = data.results[0].urls.regular;
        bgImage.onload = () => {
          bgImage.classList.remove('hidden');
          bgVideo.style.opacity = '0';
          setTimeout(() => bgVideo.pause(), 500);
        };
      } else {
        fallbackToVideo();
      }
    } catch (error) {
      console.error("Image fetch error", error);
      fallbackToVideo();
    }
  }

  function fallbackToVideo() {
    bgImage.classList.add('hidden');
    bgVideo.style.opacity = '1';
    
    const sourceEl = bgVideo.querySelector('source');
    if (sourceEl && !sourceEl.getAttribute('src').includes('weather.mp4')) {
      sourceEl.setAttribute('src', 'weather.mp4');
      bgVideo.load();
    }
    bgVideo.play().catch(e => console.log('Auto-play prevented:', e));
  }

  if (citySearchBtn) {
    citySearchBtn.addEventListener('click', () => {
      searchCityWeather(citySearchInput.value.trim());
    });
  }

  if (citySearchInput) {
    citySearchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        searchCityWeather(citySearchInput.value.trim());
      }
    });
  }

  // --- AI CHATBOT LOGIC ---
  const chatInput = document.getElementById('chat-input');
  const chatSendBtn = document.getElementById('chat-send-btn');
  const chatMessages = document.getElementById('chat-messages');
  let chatHistory = [];

  async function sendChatMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    appendMessage('user', text);
    chatInput.value = '';
    chatHistory.push({ role: 'user', content: text });

    const typingIndicator = appendMessage('bot', 'Typing...', true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: chatHistory })
      });
      
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      
      const botReply = data.choices[0].message.content;
      chatHistory.push({ role: 'assistant', content: botReply });
      
      typingIndicator.textContent = botReply;
      typingIndicator.classList.remove('typing');
    } catch (error) {
      console.error('Chat error:', error);
      typingIndicator.textContent = 'Sorry, I encountered an error. Please try again.';
    }
  }

  function appendMessage(sender, text, isTyping = false) {
    if (!chatMessages) return null;
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-bubble ${sender === 'user' ? 'user-bubble' : 'bot-bubble'}`;
    if (isTyping) msgDiv.classList.add('typing');
    msgDiv.textContent = text;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return msgDiv;
  }

  if (chatSendBtn) {
    chatSendBtn.addEventListener('click', sendChatMessage);
  }

  if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendChatMessage();
    });
  }

  // --- AUTH & ADMIN LOGIC ---
  const authSection = document.getElementById('auth-section');
  const mainNav = document.getElementById('main-nav');
  const mainContainer = document.getElementById('main-container');
  
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const authError = document.getElementById('auth-error');
  
  const navAdminBtn = document.getElementById('nav-admin-btn');
  const logoutBtn = document.getElementById('logout-btn');

  let currentUser = null;

  document.getElementById('go-to-register').addEventListener('click', () => {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
    authError.classList.add('hidden');
  });

  document.getElementById('go-to-login').addEventListener('click', () => {
    registerForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
    authError.classList.add('hidden');
  });

  document.getElementById('login-btn').addEventListener('click', async () => {
    const user = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value.trim();
    if (!user || !pass) return showError('Please fill both fields');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass })
      });
      if (!res.ok) throw new Error('Invalid credentials');
      
      currentUser = await res.json();
      completeLogin();
    } catch (err) {
      showError(err.message);
    }
  });

  document.getElementById('reg-btn').addEventListener('click', async () => {
    const user = document.getElementById('reg-user').value.trim();
    const pass = document.getElementById('reg-pass').value.trim();
    if (!user || !pass) return showError('Please fill both fields');

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass })
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Registration failed');
      }
      
      currentUser = await res.json();
      completeLogin();
    } catch (err) {
      showError(err.message);
    }
  });

  function showError(msg) {
    authError.textContent = msg;
    authError.classList.remove('hidden');
  }

  function completeLogin() {
    authSection.classList.add('hidden');
    mainNav.classList.remove('hidden');
    mainContainer.classList.remove('hidden');
    
    if (currentUser.role === 'admin') {
      navAdminBtn.classList.remove('hidden');
      loadAdminData();
      
      navBtns.forEach(b => b.classList.remove('active'));
      navAdminBtn.classList.add('active');
      pageSections.forEach(s => s.classList.add('hidden'));
      document.getElementById('admin-section').classList.remove('hidden');
      
      // We don't necessarily call detectLocation() for admin immediately,
      // but they can navigate to Map Explorer if they want.
      detectLocation();
    } else {
      navAdminBtn.classList.add('hidden');
      detectLocation();
    }
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      location.reload();
    });
  }

  // --- ADMIN UI LOGIC ---
  const adminTabs = document.querySelectorAll('.admin-tab');
  const adminPanels = document.querySelectorAll('.admin-panel');

  adminTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      adminTabs.forEach(t => t.classList.remove('active'));
      adminPanels.forEach(p => p.classList.add('hidden'));
      tab.classList.add('active');
      document.getElementById(tab.getAttribute('data-target')).classList.remove('hidden');
    });
  });

  function showAdminNotification(msg, isError = false) {
    const notif = document.getElementById('admin-notification');
    notif.textContent = msg;
    notif.className = `admin-notification ${isError ? 'error' : 'success'}`;
    notif.classList.remove('hidden');
    setTimeout(() => {
      notif.classList.add('hidden');
    }, 3000);
  }

  async function loadAdminData() {
    loadAdminCrops();
    loadAdminUsers();
  }

  async function loadAdminCrops() {
    try {
      const res = await fetch('/api/crops');
      const crops = await res.json();
      const tbody = document.getElementById('admin-crops-tbody');
      tbody.innerHTML = '';
      crops.forEach(crop => {
        const statesStr = Array.isArray(crop.states) ? crop.states.join(', ') : crop.states;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${crop.id}</td>
          <td>${crop.name}</td>
          <td>${statesStr}</td>
          <td>
            <button class="action-btn" onclick="deleteCrop(${crop.id})">Delete</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } catch (err) { console.error(err); }
  }

  async function loadAdminUsers() {
    try {
      const res = await fetch('/api/users');
      const users = await res.json();
      const tbody = document.getElementById('admin-users-tbody');
      tbody.innerHTML = '';
      users.forEach(u => {
        const delBtn = u.id === currentUser.id ? '' : `<button class="action-btn" onclick="deleteUser(${u.id})">Delete</button>`;
        const roleSelect = u.id === currentUser.id ? `<span style="padding:0.5rem;">${u.role}</span>` : `
          <select class="role-select" onchange="changeRole(${u.id}, this.value)">
            <option value="user" ${u.role === 'user' ? 'selected' : ''}>User</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
          </select>`;
          
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${u.id}</td>
          <td>${u.username}</td>
          <td>${roleSelect}</td>
          <td>${delBtn}</td>
        `;
        tbody.appendChild(tr);
      });
    } catch (err) { console.error(err); }
  }

  document.getElementById('ac-submit-btn').addEventListener('click', async () => {
    const data = {
      name: document.getElementById('ac-name').value,
      quality: document.getElementById('ac-quality').value,
      ideal_weather: document.getElementById('ac-weather').value,
      states: document.getElementById('ac-states').value.split(',').map(s => s.trim()).filter(s => s),
      water_required: document.getElementById('ac-water').value,
      soil_density: document.getElementById('ac-density').value,
      soil_type: document.getElementById('ac-soil').value
    };
    try {
      const res = await fetch('/api/crops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        showAdminNotification('Crop added successfully');
        // Clear inputs
        document.querySelectorAll('.add-crop-form input').forEach(input => input.value = '');
        loadAdminCrops();
      } else {
        showAdminNotification('Failed to add crop', true);
      }
    } catch (err) { console.error(err); showAdminNotification('Error adding crop', true); }
  });

  window.deleteCrop = async (id) => {
    // We remove the confirm() dialog and replace it with a direct delete + notification
    // Or we could implement a custom UI confirm, but prompt says "make it into the UI only"
    try {
      const res = await fetch(`/api/crops/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showAdminNotification('Crop deleted successfully');
        loadAdminCrops();
      } else {
        showAdminNotification('Failed to delete crop', true);
      }
    } catch (err) { console.error(err); showAdminNotification('Error deleting crop', true); }
  };

  window.deleteUser = async (id) => {
    if(!confirm('Are you sure you want to delete this user?')) return;
    try {
      await fetch(`/api/users/${id}`, { method: 'DELETE' });
      loadAdminUsers();
    } catch (err) { console.error(err); }
  };

  window.changeRole = async (id, role) => {
    try {
      await fetch(`/api/users/${id}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role })
      });
      loadAdminUsers();
    } catch (err) { console.error(err); }
  };

});
