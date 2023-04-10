"use strict";

class MeetInMiddle {
  constructor() {
    this.map = null;
    this.markers = [];
    this.middlePointMarker = null;
    this.googleStreets = null;
  }

  async getUserLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported by your browser"));
      } else {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            });
          },
          (error) => {
            reject(error);
          }
        );
      }
    });
  }

  async initMap() {
    let initialCoordinates;

    try {
      initialCoordinates = await this.getUserLocation();
    } catch (error) {
      console.error("Error getting user's location, using default coordinates");
      initialCoordinates = { lat: 51.505, lng: -0.09 }; // Default coordinates
    }

    this.map = L.map("map").setView(
      [initialCoordinates.lat, initialCoordinates.lng],
      13
    );

    this.googleStreets = L.tileLayer(
      "http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
      {
        maxZoom: 18,
        subdomains: ["mt0", "mt1", "mt2", "mt3"],
      }
    ).addTo(this.map);
  }

  async geocodeAddress(address) {
    const query = encodeURIComponent(address);
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`
    );

    if (!response.ok) {
      throw new Error("Failed to geocode address");
    }

    const data = await response.json();
    if (data.length === 0) {
      throw new Error("No results found");
    }

    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
    };
  }

  getColoredMarkerIcon(color) {
    const coloredIcon = L.icon({
      iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
      shadowUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });
    return coloredIcon;
  }

  async addMarker(coordinates) {
    const newMarker = L.marker(coordinates).addTo(this.map);
    this.markers.push(newMarker);
    this.map.setView(coordinates, 13);

    if (this.markers.length >= 2) {
      const middlePoint = this.calculateMiddlePoint(this.markers);

      if (this.middlePointMarker) {
        this.map.removeLayer(this.middlePointMarker);
      }
      const middlePointIcon = this.getColoredMarkerIcon("red"); // You can change "red" to any color you like
      this.middlePointMarker = L.marker(middlePoint, {
        icon: middlePointIcon,
      }).addTo(this.map);
      this.map.setView(middlePoint, 13);

      // Update the middle address
      const middleAddress = await this.reverseGeocode(
        middlePoint.lat,
        middlePoint.lng
      );
      this.updateMiddleAddress(middleAddress);

      try {
        // Call findNearbyPoi with the new object parameter
        const pois = await this.findNearbyPoi(
          middlePoint.lat,
          middlePoint.lng,
          { type: "amenity", value: "cafe" }
        );
        if (pois.length > 0) {
          this.updateHangoutRecommendation(pois[0].name);
        } else {
          this.updateHangoutRecommendation("No nearby cafes found");
        }
      } catch (error) {
        console.error(error);
        alert("Error: Could not find hangout recommendations");
      }
    }
  }

  calculateMiddlePoint(markers) {
    let sumLat = 0;
    let sumLng = 0;
    let markerCount = markers.length;

    for (const marker of markers) {
      sumLat += marker.getLatLng().lat;
      sumLng += marker.getLatLng().lng;
    }

    // Calculate the middle point only if there are more than 1 markers.
    if (markerCount > 1) {
      return {
        lat: sumLat / markerCount,
        lng: sumLng / markerCount,
      };
    } else {
      return null;
    }
  }

  async handleAddressSubmit(event, targetForm) {
    event.preventDefault();

    const addressInput = targetForm.querySelector("input[name='address1']");
    const address = addressInput.value;

    try {
      const coordinates = await this.geocodeAddress(address);
      this.addMarker(coordinates);
    } catch (error) {
      console.error(error);
      alert("Error: Could not find the address");
    }
  }

  addNewUserForm() {
    const formContainer = document.querySelector(".data_form.address");
    const addressForms = formContainer.querySelectorAll("form");
    const lastForm = addressForms[addressForms.length - 1];

    const newForm = lastForm.cloneNode(true);
    newForm.reset();

    const newUserBtn = document.getElementById("newUserBtn");
    formContainer.insertBefore(newForm, newUserBtn);
    newForm.addEventListener("submit", (event) =>
      this.handleAddressSubmit(event, newForm)
    );
  }

  setupEventListeners() {
    const addressForm = document.getElementById("addressForm");
    addressForm.addEventListener("submit", (event) =>
      this.handleAddressSubmit(event, addressForm)
    );

    const newUserBtn = document.getElementById("newUserBtn");
    newUserBtn.addEventListener("click", () => this.addNewUserForm());
  }

  init() {
    this.initMap();
    this.setupEventListeners();
  }
  async reverseGeocode(lat, lng) {
    let radius = 50;
    const maxRadius = 1000;
    const step = 50;

    while (radius <= maxRadius) {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&radius=${radius}`
      );

      if (!response.ok) {
        throw new Error("Failed to reverse geocode coordinates");
      }

      const data = await response.json();
      if (!data.address) {
        throw new Error("No address found");
      }

      // Check if the address is not a highway
      if (data.address.road && !data.address.highway) {
        return data.display_name;
      }

      radius += step;
    }

    throw new Error("No suitable address found");
  }

  updateMiddleAddress(address) {
    const middleAddressElement = document.getElementById("middle_address");
    middleAddressElement.textContent = address;
  }

  async findNearbyPoi(lat, lng, query, radius = 10000) {
    const overpassApiUrl = "https://overpass-api.de/api/interpreter";
    const queryString = encodeURIComponent(
      `[out:json][timeout:25];` +
        `nwr(around:${radius},${lat},${lng})["name"]["${query.type}"="${query.value}"];` +
        `out center;`
    );

    const response = await fetch(`${overpassApiUrl}?data=${queryString}`);

    if (!response.ok) {
      throw new Error("Failed to fetch nearby POI data");
    }

    const data = await response.json();
    const pois = data.elements.map((element) => ({
      id: element.id,
      lat: element.lat,
      lng: element.lon,
      name: element.tags.name,
    }));

    return pois;
  }

  updateHangoutRecommendation(recommendation) {
    const hangoutElement = document.getElementById("Hangout_middle_place");
    hangoutElement.textContent = recommendation;
  }
}

function leafletLoaded() {
  return new Promise((resolve) => {
    if (typeof L !== "undefined") {
      resolve();
    } else {
      const script = document.querySelector('script[src*="leaflet.js"]');
      script.addEventListener("load", () => {
        resolve();
      });
    }
  });
}

Promise.all([
  new Promise((resolve) =>
    window.addEventListener("DOMContentLoaded", resolve)
  ),
  leafletLoaded(),
]).then(() => {
  const meetInMiddle = new MeetInMiddle();
  meetInMiddle.init();
});
