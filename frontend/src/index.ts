import L, { LeafletKeyboardEvent, LeafletMouseEvent } from 'leaflet';
import { GeoSearchControl, GoogleProvider, OpenStreetMapProvider } from 'leaflet-geosearch';

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

  if (!(map as any).restoreView()) {
    // Default view on Essex County, ON.
    map.setView([42.1659, -82.6633], 11);
  }

  // Set up hash plugin
  const allMapLayers = {
    cyclosm: cyclosm,
  };
  (L as any).hash(map, allMapLayers);

  // Add a scale
  L.control.scale().addTo(map);

  // Crosshair cursor
  L.DomUtil.addClass(map.getContainer(), 'crosshair-cursor-enabled');

  // =========
  // Variables
  // =========

  // Modes
  var isEditingNogos = false;
  var showAllNogos = false;

  // Map feature containers
  var newRouteMarkers: L.Marker[] = []; // markers currently being selected for a new route
  var newNogos: GeoJSON.LineString[] = []; // new nogo routes to be submitted
  var selectedNogoIds: string[] = []; // selected nogo route IDs to be deleted

  // Layer groups
  var markerLayerGroup = L.layerGroup().addTo(map); // all markers to show on map
  var cursorLineLayerGroup = L.geoJSON().addTo(map); // line to cursor when drawing routes
  var routeLayerGroup = L.geoJSON().addTo(map); // all routes to show on map
  var allNogosLayerGroup = L.geoJSON().addTo(map); // all nogos to show on map

  // Colors
  const routeDefaultColor = '#2aa38d';
  const nogoDefaultColor = '#b35a54';
  const nogoSelectedColor = '#abb357';
  const buttonDefaultColor = '#ffffff';
  const buttonActiveColor = '#8f8f8f';

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

  const clearRoutes = () => {
    markerLayerGroup.clearLayers();
    routeLayerGroup.clearLayers();
    clearNewRouteMarkers();
  };

  // Click map to select route waypoints
  map.on('click', (e: LeafletMouseEvent) => {
    if (isEditingNogos && selectedNogoIds.length) {
      // clicking shouldn't add new markers when selecting nogos to delete
      return;
    }
    const pointLocation = e.latlng;
    const marker = L.marker(pointLocation, { icon: markerIcon }).addTo(
      markerLayerGroup
    );
    newRouteMarkers.push(marker);
    searchControl.update()
    if (isEditingNogos && newRouteMarkers.length >= 2) {
      fetchDirections();
    }
  });

  // Draw line from first marker to cursor when adding nogos
  map.on('mousemove', (e: LeafletMouseEvent) => {
    if (isEditingNogos && newRouteMarkers.length === 1) {
      cursorLineLayerGroup.clearLayers();
      L.polyline([newRouteMarkers[0].getLatLng(), e.latlng], {
        color: nogoDefaultColor,
      }).addTo(cursorLineLayerGroup);
    }
  });

  // Handle pressing Escape key to clear selected points
  map.on('keyup', (e: LeafletKeyboardEvent) => {
    if (e.originalEvent.key === 'Escape') {
      clearNewRouteMarkers();
      cursorLineLayerGroup.clearLayers();
      if (isEditingNogos && selectedNogoIds.length) {
        selectedNogoIds = [];
        deleteNogoControl.update();
        fetchAllNogos();
      }
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
    if (!newRouteMarkers.length) {
      return;
    }

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
      newRouteMarkers = [];
      if (isEditingNogos) {
        newNogos.push(route_geojson.features[0].geometry);
        submitNogos();
      } else {
        const layer = L.geoJSON(route_geojson, {
          style: {
            color: routeDefaultColor,
            weight: 5,
            opacity: 1.0,
          },
        }).addTo(routeLayerGroup);
      }
    });
  };

  // =============
  // Nogo handlers
  // =============

  const fetchAllNogos = async () => {
    const res = await fetch('/api/nogos', {
      method: 'GET',
      headers: {
        'content-type': 'application/json',
      },
    });

    const nogos: (GeoJSON.LineString & { _id: string })[] = await res.json();

    nogos.forEach((nogo) => {
      L.geoJSON(nogo, {
        style: {
          color: nogoDefaultColor,
          weight: 5,
          opacity: 1.0,
        },
        bubblingMouseEvents: false,
        onEachFeature: (feature, layer) => {
          layer.on({
            click: (e) => {
              if (!isEditingNogos) {
                return;
              }

              const existingSelectedIndex = selectedNogoIds.findIndex(
                (selectedNogoId) => selectedNogoId === nogo._id
              );

              if (existingSelectedIndex > -1) {
                selectedNogoIds.splice(existingSelectedIndex, 1);
                deleteNogoControl.update();
                e.target.setStyle({ color: nogoDefaultColor });
              } else {
                selectedNogoIds.push(nogo._id);
                deleteNogoControl.update();
                e.target.setStyle({ color: nogoSelectedColor });
              }
            },
          });
        },
      }).addTo(allNogosLayerGroup);
    });
  };

  const submitNogos = () => {
    if (!newNogos.length) {
      return;
    }

    fetch('/api/nogos', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(newNogos),
    }).then(() => {
      newNogos = [];
      markerLayerGroup.clearLayers();
      cursorLineLayerGroup.clearLayers();
      allNogosLayerGroup.clearLayers();
      fetchAllNogos();
    });
  };

  const deleteNogos = () => {
    if (!selectedNogoIds.length) {
      return;
    }

    fetch('/api/nogos/delete', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(selectedNogoIds),
    }).then(() => {
      selectedNogoIds = [];
      deleteNogoControl.update();
      allNogosLayerGroup.clearLayers();
      fetchAllNogos();
    });
  };

  const toggleShowAllNogos = () => {
    if (isEditingNogos && showAllNogos) {
      return;
    }
    showAllNogos = !showAllNogos;
    allNogosButton.state(showAllNogos ? 'showNogos' : 'hideNogos');
    (allNogosButton as any).button.style.backgroundColor = showAllNogos
      ? buttonActiveColor
      : buttonDefaultColor;
    if (showAllNogos) {
      fetchAllNogos();
    } else {
      allNogosLayerGroup.clearLayers();
    }
  };

  const toggleNogoMode = () => {
    isEditingNogos = !isEditingNogos;
    addNogosButton.state(isEditingNogos ? 'nogoMode' : 'notNogoMode');
    (addNogosButton as any).button.style.backgroundColor = isEditingNogos
      ? buttonActiveColor
      : buttonDefaultColor;
    clearRoutes();
    // nogoControl.update();
    searchControl.update();
    submitControl.update();
    deleteNogoControl.update();
    cursorLineLayerGroup.clearLayers();
    if (isEditingNogos) {
      toggleShowAllNogos();
    } else {
      selectedNogoIds = [];
      allNogosLayerGroup.clearLayers();
      fetchAllNogos();
    }
  };

  // ======================
  // Add custom UI controls
  // ======================

  // Delete nogo button
  var deleteNogoControl = (L as any).control({ position: 'bottomright' });
  deleteNogoControl.onAdd = function () {
    this._div = L.DomUtil.create('button', 'submit-button');
    this.update();
    return this._div;
  };
  deleteNogoControl.update = function () {
    const controlDiv: HTMLDivElement = this._div;
    controlDiv.onclick = (e) => {
      e.stopPropagation();
      deleteNogos();
    };
    if (isEditingNogos) {
      controlDiv.innerHTML =
        selectedNogoIds.length > 0
          ? `Delete ${selectedNogoIds.length} nogo${
              selectedNogoIds.length > 1 ? 's' : ''
            }`
          : 'Select nogos to delete';
      controlDiv.style.display = 'block';
    } else {
      controlDiv.innerHTML = '';
      controlDiv.style.display = 'none';
    }
  };
  deleteNogoControl.addTo(map);

  // Submit button
  var submitControl = (L as any).control({ position: 'bottomright' });
  submitControl.onAdd = function () {
    this._div = L.DomUtil.create('button', 'submit-button');
    this.update();
    return this._div;
  };
  submitControl.update = function () {
    const controlDiv: HTMLDivElement = this._div;
    if (isEditingNogos) {
      controlDiv.innerHTML = '';
      controlDiv.style.display = 'none';
    } else {
      controlDiv.innerHTML = 'Get directions';
      controlDiv.style.display = 'block';
      controlDiv.onclick = (e) => {
        e.stopPropagation();
        fetchDirections();
      };
    }
  };
  submitControl.addTo(map);

  // Nogo popup when editing
  // var nogoControl = (L as any).control({ position: 'topright' });
  // nogoControl.onAdd = function () {
  //   this._div = L.DomUtil.create('div', 'nogo-control');
  //   this.update();
  //   return this._div;
  // };
  // nogoControl.update = function () {
  //   const controlDiv: HTMLDivElement = this._div;
  //   if (isEditingNogos) {
  //     controlDiv.innerHTML = 'You are editing no-go routes';
  //     controlDiv.style.display = 'block';
  //   } else {
  //     controlDiv.innerHTML = '';
  //     controlDiv.style.display = 'none';
  //   }
  // };
  // nogoControl.addTo(map);

  // var searchControl = (L as any).control({ position: 'topright' });
  // searchControl.onAdd = function () {
  //   this._div = L.DomUtil.create('div', 'search-control');
  //   this._div.innerHTML = 'Search ...'
  //   // this.update();
  //   return this._div;
  // };
  // searchControl.update = function () {
  //   const controlDiv: HTMLDivElement = this._div;
  //   if (isEditingNogos) {
  //     controlDiv.innerHTML = 'You are editing no-go routes';
  //     controlDiv.style.display = 'block';
  //   } else {
  //     controlDiv.innerHTML = '';
  //     controlDiv.style.display = 'none';
  //   }
  // };
  // searchControl.addTo(map);


  // ============
  // Easy buttons
  // ============

  // const provider = new OpenStreetMapProvider();
  const provider =  new GoogleProvider({
    params:{
      key: 'AIzaSyDjcwjQH4vJuVF8c0EY73uDkYf1Xz4Ot1Y',
    },
  })

  const SearchControl = L.Control.extend({
    // form: new HTMLElement(),
    container: L.DomUtil.create('div', 'directions-ui'),
    points: [] as HTMLElement [],
    newPointOpen: false,
    options: {
      position: 'topright',
      placeholder: 'Search ...'
    },
    initialize: function (options: any) {
      L.Util.setOptions(this, options);
    },
    onAdd: function () {
      // const container = L.DomUtil.create('div', 'directions-ui');
      L.DomEvent.disableClickPropagation(this.container);
      this.update();
      return this.container;
    },
    update: function () {
      console.log('here:', newRouteMarkers)
      L.DomUtil.empty(this.container)

      newRouteMarkers.forEach((marker, index) => {
        const point = L.DomUtil.create('div', 'leaflet-control search-control', this.container);
        // const pointLabel = L.DomUtil.create('i', `search-control__icon fa fa-regular fa-${index}`, point);
        const pointLabel = L.DomUtil.create('label', 'search-control__label', point);
        pointLabel.innerHTML = index === 0 ? 'Start:' : `Stop ${index}:`;
        const pointInput = L.DomUtil.create('input', 'search-control__input', point);
        pointInput.type = 'text';
        pointInput.placeholder = this.options.placeholder;
        this.points.push(point);


      
      const pointDelete = L.DomUtil.create('i', 'search-control__icon fa-regular fa-circle-xmark', point);
      })

      if (!this.newPointOpen) {
        const addNew = L.DomUtil.create('div', 'search-control', this.container);
        const addNewBtn = L.DomUtil.create('button','search-control__button', addNew);
        addNewBtn.innerText = 'Add starting point ...'
        addNewBtn.onclick = () => {
          this.newPointOpen = true;
          this.update();
        }
      } else { 
        const point = L.DomUtil.create('div', 'search-control', this.container);
        // const pointLabel = L.DomUtil.create('i', `search-control__icon fa fa-regular fa-${index}`, point);
        const pointLabel = L.DomUtil.create('label', 'search-control__label', point);
        pointLabel.innerHTML = newRouteMarkers.length === 0 ? 'Start:' : `Stop ${newRouteMarkers.length}:`;
        const pointInput = L.DomUtil.create('input', 'search-control__input', point);
        pointInput.type = 'text';
        pointInput.placeholder = this.options.placeholder;
        L.DomEvent.addListener(
          pointInput, 
          'keypress', 
          (e) => {
            this.onKeyPress(e, newRouteMarkers.length) 
          },
          this
        )
        this.points.push(point);

      }
      
      // (this as any ).form = L.DomUtil.create('form', 'form', container);
      // const from = L.DomUtil.create('form', 'search-control', this.container);
      // const fromLabel = L.DomUtil.create('label', 'search-control__label', from);
      // fromLabel.innerHTML = 'From:';
      // const fromInput = L.DomUtil.create('input', 'search-control__input', from);
      // fromInput.type = 'text';
      // fromInput.placeholder = this.options.placeholder;

      // const next = L.DomUtil.create('form', 'search-control', this.container);
      // const nexticon = L.DomUtil.create('i', 'search-control__icon fa-solid fa-arrow-down', next);

      // const to = L.DomUtil.create('form', 'search-control', this.container);
      // const toLabel = L.DomUtil.create('label', 'search-control__label', to);
      // toLabel.innerHTML = 'Destination:';
      // const toInput = L.DomUtil.create('input', 'search-control__input', to);
      // toInput.type = 'text';
      // toInput.placeholder = this.options.placeholder;


      // toLabel.innerHTML = 'Destination:';
      // (this as any).input = L.DomUtil.create('input', 'search-control__input', to);
      // (this as any).input.type = 'text';
      // (this as any).input.placeholder = (this as any).options.placeholder;

      // (this as any).results = L.DomUtil.create('div', 'list-group', group);
      // L.DomEvent.addListener((this as any).input, 'keyup', _.debounce((this as any).keyup, 300), this);
      // L.DomEvent.addListener(fromControl, 'submit', this.submit, this);
      // return this.container
    },
    onRemove: function (map: any) {

    },
    submit: function () {
      alert('SUBMITTED');
    },
    onKeyPress: async function (e: any, index: number) {
      if (e.key === 'Enter') {
        // fetchDirections();
        console.log('SEARCH VALUE', e.target.value)
        const results = await provider.search({ query: e.target.value })
        console.log('SEARCH RESULTS', results)
        // alert('TIME TO SEARCH')
        L.DomUtil.create('label', 'search-control__results', this.points[index]);
      }
    }
  })

  const searchControl = new SearchControl();
  searchControl.addTo(map);

  // const control = L.control.search({
  //   position: 'topright'
  // })

  // const searchControl = GeoSearchControl({
  //   provider: provider,
  // }).addTo(map);
  // // map.addControl(searchControl);

  // clear routes button
  L.easyButton(
    'fa-refresh',
    function () {
      if (!isEditingNogos) {
        clearRoutes();
      }
    },
    'Clear routes'
  ).addTo(map);

  const allNogosButton = L.easyButton({
    states: [
      {
        stateName: 'hideNogos',
        icon: 'fa-ban',
        title: 'Display all no-go routes',
        onClick: function () {
          toggleShowAllNogos();
        },
      },
      {
        stateName: 'showNogos',
        icon: 'fa-ban',
        title: 'Hide all no-go routes',
        onClick: function () {
          toggleShowAllNogos();
        },
      },
    ],
  }).addTo(map);

  const addNogosButton = L.easyButton({
    states: [
      {
        stateName: 'notNogoMode',
        icon: 'fa-edit',
        title: 'Edit no-go routes',
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
