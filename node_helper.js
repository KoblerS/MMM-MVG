/*
 * Magic Mirror
 * Node Helper: MMM-MVG
 *
 * By Simon Kobler
 * MIT Licensed
 *
 */

const NodeHelper = require("node_helper");
const globals = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/27.0.1453.110 Safari/537.36",
  "Content-Type": "application/x-www-form-urlencoded",
  Accept: "application/json, text/javascript, */*; q=0.01",
  "X-Requested-With": "XMLHttpRequest",
  "X-MVG-Authorization-Key": "5af1beca494712ed38d313714d4caff6",
  Referer: "https://www.mvg.de/dienste/abfahrtszeiten.html",
  "Accept-Encoding": "gzip",
  "Accept-Language": "en-US,en;q=0.9,de;q=0.8",
};
const fibAPI = "https://www.mvg.de/api/bgw-pt/v3";

module.exports = NodeHelper.create({
  socketNotificationReceived: function (notification, payload) {
    const self = this;
    switch (notification) {
      case "GET_STATION_INFO":
        self.getStationInfo(payload);
        self.getInterruptionsInfo();
        break;
      case "GET_DEPARTURE_DATA":
        self.getDepartureInfo(payload);
        break;
      default:
        console.error("Switch item {} is missing", notification);
    }
  },

  getDepartureInfo: function (payload) {
    const self = this;
    if (payload.stationId == 0) {
      console.warn("Station ID for the specified station (" + payload.station + ") is not available yet. Awaiting retrieval from the API.");
      return;
    }
    const args = {
      globalId: payload.stationId,
      limit: payload.maxEntries || 10,
      offsetInMinutes: 0,
      transportTypes: 'UBAHN,REGIONAL_BUS,BUS,TRAM,SBAHN'
    };

    const query = new URLSearchParams(args).toString();
    fetch(`${fibAPI}/departures?${query}`, {
      method: "GET",
      headers: globals,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Received unexpected response (${response.statusText}) from MVG api while retrieving departure data: ${await response.text()}`);
        }
        return response.json();
      })
      .then((data) => {        
        payload.transport = data;
        self.sendSocketNotification("UPDATE_DEPARTURE_INFO", payload);
      })
      .catch((error) => {
        console.error("Error while reading departure data", error);
        self.sendSocketNotification(
          "ERROR",
           "COULD_NOT_GET_DEPARTURE_DATA"
        );
      });
  },

  getStationInfo(payload) {
    const self = this;

    const args = {
      query: payload.station
    }
    const query = new URLSearchParams(args).toString();

    fetch(`${fibAPI}/locations?${query}`, {
      method: "GET",
      headers: globals,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Received unexpected response (${response.statusText}) from MVG api while retrieving station info: ${await response.text()}`);
        }
        return response.json();
      })
      .then((data) => {
        if (data?.[0]?.globalId === undefined) {
          self.sendSocketNotification("ERROR", "NO_STATION");
        } else {
          payload.stationId = data[0].globalId;
          payload.stationName = data[0].name;
          self.sendSocketNotification("UPDATE_STATION", payload);
        }
      })
      .catch((error) => {
        console.error("Error while reading station data", error);
        self.sendSocketNotification(
          "ERROR",
          "COULD_NOT_GET_STATION_DATA"
        );
      });
  },

  getInterruptionsInfo: function () {
    const self = this;

    fetch(`${fibAPI}/messages`, {
      method: "GET",
      headers: globals,
    })
      .then(async (response) => {
        if (!response.ok) {
            throw new Error(`Received unexpected response (${response.statusText}) from MVG api while retrieving interruption data: ${await response.text()}`);
        }
        return response.json();
      })
      .then((data) => {
        self.sendSocketNotification("UPDATE_INTERRUPTION_DATA", data);
      })
      .catch((error) => {
          console.error("Error while reading interuption data", error);
      });
  },
});
