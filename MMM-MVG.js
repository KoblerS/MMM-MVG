/* Timetable for public transport in Munich using MVG API */

/*
 * Magic Mirror
 * Module: MVG
 *
 * By Simon Kobler
 * MIT Licensed
 *
 */

const MS_PER_MINUTE = 60000;
Module.register("MMM-MVG", {
  // Default module configuration
  defaults: {
    headerPrefix: '', // Header prefix
    maxEntries: 8, // maximum number of results shown on UI
    updateInterval: MS_PER_MINUTE, // update every 60 seconds
    station: "Hauptbahnhof", // default departure station
    stationId: 0,
    stationName: "",
    ignoreStations: [], // list of destination to be ignored in the list
    lineFiltering: {
      active: false, // set this to active if filtering should be used
      filterType: "blacklist", // whitelist = only specified lines will be displayed, blacklist = all lines except specified lines will be displayed
      lineNumbers: [], // lines that should be on the white-/blacklist
    },
    timeToWalk: 0, // walking time to the station
    showWalkingTime: false, // if the walking time should be included and the starting time is displayed
    showTrainDepartureTime: true,
    trainDepartureTimeFormat: "relative",
    walkingTimeFormat: "relative",
    showIcons: false,
    transportTypesToShow: {
      ubahn: true,
      sbahn: true,
      regional_bus: true,
      bus: true,
      tram: true,
    },
    showInterruptions: true,
    showInterruptionsDetails: true,
    countInterruptionsAsItemShown: false,
  },

  getStyles: function () {
    return ["MMM-MVG.css"];
  },

  // Load translations files
  getTranslations: function () {
    return {
      en: "translations/en.json",
      de: "translations/de.json",
    };
  },

  start: function () {
    this.resultData = [];
    this.interruptionData = null;
    Log.info(
      "Starting module: " + this.name + ", identifier: " + this.identifier
    );
    if (this.config.station !== "") {
      this.sendSocketNotification("GET_STATION_INFO", this.config);
    }
  },

  /*
   * getData
   * function call getData function in node_helper.js
   *
   */
  getData: function () {
    const self = this;
    self.sendSocketNotification("GET_DEPARTURE_DATA", self.config);
    setInterval(function () {
      self.sendSocketNotification("GET_DEPARTURE_DATA", self.config);
    }, self.config.updateInterval);
  },

  // Override dom generator.
  getDom: function () {
    let wrapperTable = document.createElement("div");

    if (this.error) {
      wrapperTable.className = "dimmed light small";
      wrapperTable.innerHTML = this.translate(this.error);
      return wrapperTable;
    }

    if (this.config.station === "") {
      wrapperTable.className = "dimmed light small";
      wrapperTable.innerHTML = "Please set value for 'station'.";
      return wrapperTable;
    }

    if (Object.keys(this.resultData).length === 0) {
      wrapperTable.className = "dimmed light small";
      wrapperTable.innerHTML = this.translate("LOADING");
      return wrapperTable;
    }
    
    wrapperTable = document.createElement("table");
    wrapperTable.className = "small";
    wrapperTable.innerHTML = this.resultData[this.config.stationId];
    return wrapperTable;
  },

  getHtml: function (jsonObject) {
    let htmlText = "";

    let visibleLines = 0;
    const interruptions = new Set();

    for (let i = 0; i < jsonObject.length; i++) {
      if (visibleLines >= this.config.maxEntries) {
        break;
      }
      // get one item from api result
      const apiResultItem = jsonObject[i];
      // get transport type
      const transportType = apiResultItem.transportType.toLocaleLowerCase();

      // check if we should show data of this transport type
      if (
        !this.config.transportTypesToShow[transportType] ||
        this.config.ignoreStations.includes(apiResultItem.destination) ||
        this.checkToIgnoreOrIncludeLine(apiResultItem.label)
      ) {
        continue;
      }

      if (
        this.config.showInterruptions &&
        this.isLineAffected(apiResultItem.label)
      ) {
        htmlText += "<tr class='gray'>";
      } else {
        htmlText += "<tr class='normal'>";
      }
      // check if user want's icons
      htmlText += this.showIcons(apiResultItem.transportType, this.config.showIcons);
      // check if user want's to see transportation badge
      htmlText += this.getTransportationBadge(
        apiResultItem.transportType,
        apiResultItem.label
      );

      // add last station aka direction
      htmlText +=
        "<td class='stationColumn'>" + apiResultItem.destination + "</td>";
      // check if user want's to see departure time
      htmlText += this.showDepartureTime(apiResultItem.plannedDepartureTime);
      // check if user want's to see walking time
      htmlText += this.showWalkingTime(apiResultItem.plannedDepartureTime);
      htmlText += "</tr>";
      if (
        this.config.showInterruptionsDetails &&
        this.isLineAffected(apiResultItem.label)
      ) {
        let interruption = this.getInterruptionsDetails(apiResultItem.label);
        if (!interruptions.has(interruption)) {
          interruptions.add(interruption);
          htmlText +=
            "<tr><td></td><td class='empty' colspan='3'>" +
            interruption +
            "</td></tr>";
          if (this.config.countInterruptionsAsItemShown) {
            visibleLines++;
          }
        }
      }
      visibleLines++;
    }
    return htmlText;
  },

  checkToIgnoreOrIncludeLine: function (lineName) {
    return (
      this.config.lineFiltering !== undefined &&
      this.config.lineFiltering.active &&
      (this.config.lineFiltering.filterType.localeCompare("whitelist") === 0
        ? !this.checkLineNumbersIncludes(lineName)
        : this.checkLineNumbersIncludes(lineName))
    );
  },

  checkLineNumbersIncludes: function (lineName) {
    return this.config.lineFiltering.lineNumbers.includes(lineName);
  },

  isLineAffected: function (lineName) {
    if (this.interruptionData != undefined) {
      for (
        let i = 0;
        i < this.interruptionData.length;
        i++
      ) {
        const line = this.interruptionData[i].lines.find(line => line.label === lineName);
        if (line) {
          return true;
        }
      }
    }
    return false;
  },

  getInterruptionsDetails: function (lineName) {
    for (let i = 0; i < this.interruptionData.length; i++) {
      if (this.interruptionData[i].lines != null) {
        for (
          let j = 0;
          j < this.interruptionData[i].lines.length;
          j++
        ) {
          if (
            this.interruptionData[i].lines[j].label ===
            lineName
          ) {
            const validFrom = new Date(this.interruptionData[i].validFrom).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' });
            let validTo = '';
            if (this.interruptionData[i].validTo) {
              validTo = `- ${new Date(this.interruptionData[i].validTo).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })}`;
            }
            return `(${validFrom}${validTo}) - ${this.interruptionData[i].title}`;
          }
        }
      }
    }
    return "";
  },

  showIcons: function (product, showIcons) {
    let icons = "";
    if (showIcons) {
      icons = "<td class='" + product.toLocaleLowerCase() + "'></td>";
    }
    return icons;
  },

  getTransportationBadge: function (product, label) {
    let badge = "";
    switch (product) {
      case "UBAHN":
        badge = `<td class="transport ${label.toUpperCase()}">${label}</td>`;
        break;
      case "SBAHN":
        badge = `<td class="transport ${label.toUpperCase()}">${label}</td>`;
        break;
      case "REGIONAL_BUS":
        badge = `<td class="transport BUS">${label}</td>`;
        break;
      case "BUS":
        badge = `<td class="transport BUS">${label}</td>`;
        break;
      case "TRAM":
        badge = `<td class="transport TRAM">${label}</td>`;
        break;
      default:
        badge = "";
    }
    return badge;
  },

  showWalkingTime: function (departureTime) {
    let htmlText = "";
    if (this.config.showWalkingTime) {
      htmlText += "<td> / ";
      const startWalkingTime = new Date(
        departureTime - this.config.timeToWalk * MS_PER_MINUTE
      );
      // check what kind of walking time user wants (absolute / relative)
      if (this.config.walkingTimeFormat === "absolute") {
        htmlText += this.getAbsoluteTime(startWalkingTime);
      } else if (this.config.walkingTimeFormat === "relative") {
        htmlText += this.getRelativeTime(startWalkingTime);
      } else {
        htmlText += "walkingTimeFormat config is wrong";
      }
      htmlText += "</td>";
    }
    return htmlText;
  },
  showDepartureTime: function (departureTime) {
    let htmlText = "";
    if (this.config.showTrainDepartureTime) {
      // add departure time
      htmlText += "<td class='timing'>";
      const departureDate = new Date(departureTime);
      // check what kind of time user wants (absolute / relative)
      if (this.config.trainDepartureTimeFormat === "absolute") {
        htmlText += this.getAbsoluteTime(departureDate);
      } else if (this.config.trainDepartureTimeFormat === "relative") {
        htmlText += this.getRelativeTime(departureDate);
      } else {
        htmlText += "trainDepartureTimeFormat config is wrong";
      }
      htmlText += "</td>";
    }
    return htmlText;
  },
  getAbsoluteTime: function (time) {
    let hoursStr = (time.getHours() < 10 ? "0" : "") + time.getHours();
    let minutesStr = (time.getMinutes() < 10 ? "0" : "") + time.getMinutes();

    return hoursStr + ":" + minutesStr;
  },
  getRelativeTime: function (time) {
    const timingForStartWalking = Math.floor(
      (time.getTime() - new Date().getTime()) / 1000 / 60
    );
    return timingForStartWalking <= 0
      ? this.translate("JETZT")
      : this.translate("IN") +
          " " +
          timingForStartWalking +
          " " +
          this.translate("MIN");
  },
  // Override getHeader method.
  getHeader: function () {
    if (this.config.station !== "" || this.config.stationName !== "") {
      let header = this.data.header ?? '';
      if (header) {
        header += ' ';
      }
      return (
        header +
        (this.config.stationName === ""
          ? this.config.station
          : this.config.stationName)
      );
    }
    return "";
  },
  socketNotificationReceived: function (notification, payload) {
    switch (notification) {
      case "UPDATE_DEPARTURE_INFO":
        this.error = null;
        this.resultData[payload.stationId] = this.getHtml(payload.transport);
        break;

      case "UPDATE_STATION":
        this.error = null;
        if (this.config.station === payload.station) {
          this.config.stationId = payload.stationId;
          this.config.stationName = payload.stationName;
        }
        this.getHeader();
        this.getData();
        break;

      case "UPDATE_INTERRUPTION_DATA":
        this.interruptionData = payload;
        break;

      case "ERROR":
        Log.error(payload.error);
        this.error = payload.text;

      default:
        Log.error();
    }
    this.updateDom();
  },
});
