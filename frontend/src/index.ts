import L, { LeafletKeyboardEvent, LeafletMouseEvent } from 'leaflet';

import '@bagage/leaflet.restoreview';
import 'leaflet-fullhash';
import 'leaflet-easybutton';

import tingle from 'tingle.js';

import './../node_modules/leaflet-easybutton/src/easy-button.css';
import './../node_modules/leaflet/dist/leaflet.css';
import './../node_modules/tingle.js/dist/tingle.css';

import './legend.css';
import './styles.css';

if (process.env.NODE_ENV === 'production') {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/service-worker.js')
        .then((registration) => {
          console.log('SW registered: ', registration);
        })
        .catch((registrationError) => {
          console.log('SW registration failed: ', registrationError);
        });
    });
  }
}

const VERSION = 'v0.1'; // TODO: Bump when pushing new version in production

function checkQuerySelector(
  parent: Element | Document,
  selector: string
): Element {
  const element = parent.querySelector(selector);
  if (element == null) {
    console.error('Parent: ', parent);
    console.error('Selector: ', selector);
    throw new Error(`"${selector}" did not match any elements on parent.`);
  }
  return element;
}

function isLocalStorageAvailable() {
  try {
    const storageTest = '__storage_test__';
    window.localStorage.setItem(storageTest, storageTest);
    window.localStorage.removeItem(storageTest);
    return true;
  } catch (e) {
    console.warn('Your browser blocks access to localStorage');
    return false;
  }
}

const hasLocalStorage = isLocalStorageAvailable();

function shouldShowModalOnStartup() {
  if (!hasLocalStorage) {
    return true;
  }
  if (window.localStorage['lastModalShown'] !== VERSION) {
    return true;
  }
  return false;
}

document.addEventListener('DOMContentLoaded', function () {
  // ============
  // Handle modal
  // ============
  const modal = new tingle.modal({
    footer: false,
    closeMethods: ['overlay', 'button', 'escape'],
    closeLabel: 'Go to map',
  });

  modal.setContent(checkQuerySelector(document, '#modal-content').innerHTML);

  if (shouldShowModalOnStartup()) {
    modal.open();

    if (hasLocalStorage) {
      window.localStorage['lastModalShown'] = VERSION;
    }
  }

  // ==========
  // Handle map
  // ==========
  // Available tiles definition
  const cyclosm = L.tileLayer(
    'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
    {
      attribution:
        'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
      minZoom: 0,
      maxZoom: 20,
    }
  );

  const map = new L.Map('map', {
    zoomControl: true,
    layers: [cyclosm],
  });

  map.attributionControl.setPrefix(
    '<a href="http://leafletjs.com" title="A JS library for interactive maps">Leaflet</a> | <a href="https://github.com/cyclosm/cyclosm-cartocss-style/releases" title="CyclOSM - Open Bicycle render">CyclOSM</a> ' +
      VERSION
  );

  if (!map.restoreView()) {
    // Default view on Essex County, ON.
    map.setView([42.1659, -82.6633], 11);
  }

  // Set up hash plugin
  const allMapLayers = {
    cyclosm: cyclosm,
  };
  L.hash(map, allMapLayers);

  // Add a scale
  L.control.scale().addTo(map);

  // Crosshair cursor
  L.DomUtil.addClass(map.getContainer(), 'crosshair-cursor-enabled');

  // =========
  // Variables
  // =========

  var isEditingNogos = false;
  var newRouteMarkers: L.Marker[] = []; // markers currently being selected for a new route
  var newNogos: GeoJSON.LineString[] = []; // new nogo routes to be submitted
  var markerLayerGroup = L.layerGroup().addTo(map); // all markers to show on map
  var routeLayerGroup = L.geoJSON().addTo(map); // all routes to show on map

  const markerIcon = L.icon({
    iconSize: [25, 41],
    iconAnchor: [10, 41],
    popupAnchor: [2, -40],
    iconUrl: 'https://unpkg.com/leaflet@1.6/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.6/dist/images/marker-shadow.png',
  });

  // =======================
  // Handle map interactions
  // =======================

  const clearNewRouteMarkers = () => {
    newRouteMarkers.forEach((routeMarker) => {
      routeMarker.removeFrom(map);
    });
    newRouteMarkers = [];
  };

  // Click map to select route waypoints
  map.on('click', (e: LeafletMouseEvent) => {
    const pointLocation = e.latlng;
    const marker = L.marker(pointLocation, { icon: markerIcon }).addTo(
      markerLayerGroup
    );
    newRouteMarkers.push(marker);
  });

  // Handle pressing Escape key to clear selected points
  map.on('keyup', (e: LeafletKeyboardEvent) => {
    if (e.originalEvent.key === 'Escape') {
      clearNewRouteMarkers();
    }
  });

  // Handle pressing Enter key to make routing request with selected points
  map.on('keypress', (e: LeafletKeyboardEvent) => {
    if (e.originalEvent.key === 'Enter' && newRouteMarkers.length > 1) {
      fetchDirections();
    }
  });

  // ================
  // Routing handlers
  // ================

  const fetchDirections = () => {
    var routeString = '';
    newRouteMarkers.forEach((routeMarker, index) => {
      if (index !== 0) {
        routeString = routeString + '|';
      }
      routeString =
        routeString +
        routeMarker.getLatLng().lng.toString() +
        ',' +
        routeMarker.getLatLng().lat.toString();
    });

    fetch(
      `${process.env.BASE_URL}/brouter?lonlats=${routeString}&profile=${
        isEditingNogos ? 'all' : 'trekking'
      }&alternativeidx=0&format=geojson`
    ).then(async (res) => {
      const route_geojson = await res.json();
      newNogos.push(route_geojson.features[0].geometry);
      const layer = L.geoJSON(route_geojson, {
        style: {
          color: '#b35a54',
          weight: 5,
          opacity: 1.0,
        },
      }).addTo(routeLayerGroup);
      newRouteMarkers = [];
      if (isEditingNogos) {
        markerLayerGroup.clearLayers();
      }
    });
  };

  // =============
  // Nogo handlers
  // =============

  // TODO: get all nogos and display on map

  const toggleNogoMode = () => {
    isEditingNogos = !isEditingNogos;
    nogoButton.state(isEditingNogos ? 'nogoMode' : 'notNogoMode');
    nogoButton.button.style.backgroundColor = isEditingNogos
      ? '#8f8f8f'
      : '#ffffff';
    nogoControl.update();
    submitControl.update();
    markerLayerGroup.clearLayers();
    routeLayerGroup.clearLayers();
  };

  const submitNogos = () => {
    newNogos.forEach((newNogo) => {
      fetch('/api/nogos', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(newNogo),
      });
    });
  };

  // ======================
  // Add custom UI controls
  // ======================

  // Submit button
  var submitControl = L.control({ position: 'bottomright' });
  submitControl.onAdd = function () {
    this._div = L.DomUtil.create('button', 'submit-button');
    this.update();
    return this._div;
  };
  submitControl.update = function () {
    const controlDiv: HTMLDivElement = this._div;
    if (isEditingNogos) {
      controlDiv.innerHTML = 'Submit nogos</button>';
      controlDiv.onclick = (e) => {
        e.stopPropagation();
        submitNogos();
      };
    } else {
      controlDiv.innerHTML = 'Get directions</button>';
      controlDiv.onclick = (e) => {
        e.stopPropagation();
        fetchDirections();
      };
    }
  };
  submitControl.addTo(map);

  // Nogo popup when editing
  var nogoControl = L.control({ position: 'topright' });
  nogoControl.onAdd = function () {
    this._div = L.DomUtil.create('div', 'nogo-control');
    this.update();
    return this._div;
  };
  nogoControl.update = function () {
    const controlDiv: HTMLDivElement = this._div;
    if (isEditingNogos) {
      controlDiv.innerHTML = 'You are adding no-go routes';
      controlDiv.style.display = 'block';
    } else {
      controlDiv.innerHTML = '';
      controlDiv.style.display = 'none';
    }
  };
  nogoControl.addTo(map);

  // ============
  // Easy buttons
  // ============

  // TODO: Easy button for toggling existing nogos

  const nogoButton = L.easyButton({
    states: [
      {
        stateName: 'notNogoMode',
        icon: 'fa-edit',
        title: 'Add no-go routes',
        onClick: function () {
          toggleNogoMode();
        },
      },
      {
        stateName: 'nogoMode',
        icon: 'fa-edit',
        title: 'Back to routing',
        onClick: function () {
          toggleNogoMode();
        },
      },
    ],
  }).addTo(map);

  L.easyButton(
    'fa-question',
    function () {
      const modal = new tingle.modal({
        footer: false,
        closeMethods: ['overlay', 'button', 'escape'],
        closeLabel: 'Go to map',
      });

      modal.setContent(
        checkQuerySelector(document, '#legend .iframe').innerHTML
      );
      modal.open();
    },
    'Legend'
  ).addTo(map);

  L.easyButton(
    'fa-info',
    function () {
      modal.open();
    },
    'About'
  ).addTo(map);

  // =============
  // Handle legend
  // =============

  function handleResize() {
    let shouldLegendOpen = true;

    if (screen.width > 800) {
      shouldLegendOpen = true;
    }

    if (hasLocalStorage && window.localStorage.isLegendOpen !== undefined) {
      shouldLegendOpen = JSON.parse(window.localStorage.isLegendOpen);
    }

    if (shouldLegendOpen) {
      (checkQuerySelector(document, '#map') as HTMLElement).style.right =
        '300px';
      (
        checkQuerySelector(document, '#legend .iframe') as HTMLElement
      ).style.display = 'initial';
      (checkQuerySelector(document, '#legend') as HTMLElement).style.width =
        '300px';
      (
        checkQuerySelector(document, '#legend button') as HTMLElement
      ).innerText = '❯';
    } else {
      (checkQuerySelector(document, '#map') as HTMLElement).style.right =
        '42px';
      (
        checkQuerySelector(document, '#legend .iframe') as HTMLElement
      ).style.display = 'none';
      (checkQuerySelector(document, '#legend') as HTMLElement).style.width =
        '42px';
      (
        checkQuerySelector(document, '#legend button') as HTMLElement
      ).innerText = '❮';
    }
  }

  handleResize();

  window.addEventListener('resize', handleResize);

  (
    checkQuerySelector(document, '#legend button') as HTMLElement
  ).addEventListener('click', function (event: MouseEvent) {
    event.preventDefault();

    if (
      (checkQuerySelector(document, '#legend button') as HTMLElement)
        .innerText == '❮'
    ) {
      if (hasLocalStorage) {
        window.localStorage.isLegendOpen = JSON.stringify(true);
      }
      (checkQuerySelector(document, '#map') as HTMLElement).style.right =
        '300px';
      (
        checkQuerySelector(document, '#legend .iframe') as HTMLElement
      ).style.display = 'initial';
      (checkQuerySelector(document, '#legend') as HTMLElement).style.width =
        '300px';
      (
        checkQuerySelector(document, '#legend button') as HTMLElement
      ).innerText = '❯';
    } else {
      if (hasLocalStorage) {
        window.localStorage.isLegendOpen = JSON.stringify(false);
      }
      (checkQuerySelector(document, '#map') as HTMLElement).style.right =
        '42px';
      (
        checkQuerySelector(document, '#legend .iframe') as HTMLElement
      ).style.display = 'none';
      (checkQuerySelector(document, '#legend') as HTMLElement).style.width =
        '42px';
      (
        checkQuerySelector(document, '#legend button') as HTMLElement
      ).innerText = '❮';
    }
    map.invalidateSize();
  });
});
