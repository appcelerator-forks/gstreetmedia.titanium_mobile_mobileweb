/*global define Ti*/
define(['Ti/_/declare', 'Ti/_/dom', 'Ti/_/event', 'Ti/_/lang', 'Ti/App/Properties', 'Ti/Geolocation', 'Ti/Map', 'Ti/UI/View', 'Ti/Utils'],
	function (declare, dom, event, lang, Properties, Geolocation, Map, View, Utils) {

		function mapType(type) {
			var t = gmaps.MapTypeId;
			switch (type) {
				case Map.HYBRID_TYPE:
					return t.HYBRID;
				case Map.SATELLITE_TYPE:
					return t.SATELLITE;
				case Map.TERRAIN_TYPE:
					return t.TERRAIN;
			}
			return t.ROADMAP;
		}

		var isDef = lang.isDef,
			mix = require.mix,
			on = require.on,
			fireEvent = View.prototype.fireEvent,
			defaultRegion = {
				latitude: 39.828175,
				longitude: -98.5795,
				latitudeDelta: 30.137412,
				longitudeDelta: 63.235658
			},
			gmaps,
			gevent,
			theInfoWindow,
			// the order of the markers MUST match the ANNOTATION_* constants defined in Ti.Map
			markers = { 0: 'red', 1: 'green', 2: 'purple' },
			locationMarkerImage,
			onload = Ti.deferStart(),
			MapView = declare('Ti.Map.View', View, {

				constructor: function () {
					this.__values__.properties.annotations = [];
					this._annotationMap = {};
					this._routes = [];
					this.fireEvent('loading');
				},

				postscript: function () {
					var self = this,
						region = self.region || defaultRegion,
						gmap = self._gmap = new gmaps.Map(self.domNode, {
							disableDefaultUI: true,
							zoom: 2,
							zoomControl: true,
							center: new gmaps.LatLng(region.latitude, region.longitude),
							mapTypeId: mapType(self.mapType)
						}),
						counter = 0;

					on(self, 'postlayout', function f () {

						//console.log("Google.js::on postlayout");
						gevent.trigger(gmap, 'resize');
						counter++;
						if (counter > 1) {
							return;
						}
						self._updateMap(region, 1);
						setTimeout(function () {
							self._updateMap(region, 1);
							self._updateUserLocation(self.userLocation);
							self.annotations.forEach(self._createMarker, self);
							self._annotationEvents = [];
							self._boundsEvt = gevent.addListener(gmap, 'bounds_changed', lang.hitch(self, '_fitRegion'));
						}, 1);
					});

					gevent.addListener(gmap, 'click', function(e) {
						//console.log("Google.js::onMapClick " + e.latLng.lat() + ", " + e.latLng.lng());
						fireEvent.call(self, 'click', {
							latitude: e.latLng.lat(),
							longitude: e.latLng.lng()
						});
					});
				},


				destroy: function () {
					//console.log("Google.js:destroy");
					event.off(this._annotationEvents);
					gevent.removeListener(this._boundsEvt);
					gevent.clearInstanceListeners(this._gmap);
					this.removeAllAnnotations();
					this._gmap = null;
					View.prototype.destroy.apply(this, arguments);
				},

				addAnnotation: function (/*Object|Ti.Map.Annotation*/a) {
					//console.log("Google.js:addAnnotation");
					if (a) {
						a.declaredClass === 'Ti.Map.Annotation' || (a = new Annotation(a));
						~this.annotations.indexOf(a) || this._createMarker(a);
						a.title && (this._annotationMap[a.title] = a);
					}
				},

				addAnnotations: function (/*Array*/annotations) {
					//console.log("Google.js:addAnnotations");
					annotations && annotations.forEach(this.addAnnotation, this);
				},

				addRoute: function (/*Object*/route) {
					//console.log("Google.js:addRoute");
					if (route && (route.points || []).length) {
						route.pline = new gmaps.Polyline({
							map: this._gmap,
							path: route.points.map(function (p) {
								return new gmaps.LatLng(p.latitude, p.longitude);
							}),
							strokeColor: route.color || '#000',
							strokeWeight: route.width || 1
						});
						this._routes.push(route);
					}
				},

				deselectAnnotation: function (/*String|Ti.Map.Annotation*/a) {
					//console.log("Google.js:deselectAnnotation");
					require.is(a, 'String') && (a = this._annotationMap[a]);
					a && theInfoWindow && theInfoWindow.widgetId === a.widgetId && this._hide(a);
				},

				removeAllAnnotations: function () {
					//console.log("Google.js:removeAllAnnotations");
					theInfoWindow && theInfoWindow.close();
					while (this.annotations.length > 0) {
						this.removeAnnotation(this.annotations[0]);
					}
				},

				removeAnnotation: function (/*String|Ti.Map.Annotation*/a) {
					//console.log("Google.js:removeAnnotation");
					require.is(a, 'String') && (a = this._annotationMap[a]);
					if (a) {
						if (!this.__values__) { return; }

						var annotations = this.__values__.properties.annotations,
							p = annotations.indexOf(a);
						theInfoWindow && this._hide(a);
						gevent.removeListener(a.evt);
						gevent.removeListener(a.dragStartEvent);
						gevent.removeListener(a.dragEndEvent);
						gevent.removeListener(a.dragEvent);
						if (a.marker) {
							a.marker.setMap(null);
							delete a.marker;
						}
						a.destroy();
						~p && annotations.splice(p, 1);
					}
				},

				removeAnnotations: function (/*Array*/annotations) {
					//console.log("Google.js:removeAnnotations");
					annotations.forEach(function (a) {
						this.removeAnnotation(a);
					}, this);
				},

				removeRoute: function (/*Object*/route) {
					//console.log("Google.js:removeRoute");
					if (route && route.name) {
						var r = this._routes,
							i = 0;
						for (; i < r.length; i++) {
							if (r[i].name === route.name) {
								route.pline.setMap(null);
								delete route.pline;
								r.splice(i--, 1);
							}
						}
					}
				},

				selectAnnotation: function (/*String|Ti.Map.Annotation*/a) {
					//console.log("Google.js:selectAnnotation");
					require.is(a, 'String') && (a = this._annotationMap[a]);
					a && this._show(a);
				},

				setLocation: function (location) {
					//console.log("Google.js:setLocation");
					location && (this.region = location);
					isDef(location.animate) && (this.animated = location.animate);
					isDef(location.animated) && (this.animated = location.animated);
					isDef(location.regionFit) && (this.regionFit = location.regionFit);
					this._updateMap(location);
				},

				zoom: function (level) {
					//console.log("Google.js:zoom");
					var gmap = this._gmap;
					gmap.setZoom(gmap.getZoom() + level);
				},

				_show: function (annotation, clicksource) {
					//console.log("Google.js:_show");
					if (annotation && (!theInfoWindow || theInfoWindow.widgetId !== annotation.widgetId)) {
						var _t = this,
							widgetId = annotation.widgetId,
							cls = 'TiMapAnnotation',
							type,
							p = dom.create('div', { className: cls }),
							annotationNode = p,
							nodes = {
								annotation: annotationNode,
								leftButton: annotation.leftButton && dom.create('img', { className: cls + 'LeftButton', src: annotation.leftButton }, p),
								rightButton: annotation.rightButton && dom.create('img', { className: cls + 'RightButton', src: annotation.rightButton }, p),
								dummy: (p = dom.create('div', { className: cls + 'Content' }, p)) && 0,
								title: dom.create('h1', { innerHTML: annotation._getTitle() }, p),
								subtitle: dom.create('p', { innerHTML: annotation._getSubtitle() }, p)
							},
							shown;

						function onShow() {
							//console.log("Google.js:onShow");
							shown || (shown = 1) && _t._dispatchEvents(annotation, clicksource);
						}

						return onShow();

						// wire up the dom nodes in the info window
						event.off(_t._annotationEvents);
						for (type in nodes) {
							(function (t, node) {
								node && _t._annotationEvents.push(on(node, 'click', function (evt) {
									event.stop(evt);
									_t._hide(annotation, t);
								}));
							}(type, nodes[type]));
						}

						// listen for updates to the annotation object. Q: why do we only listen when the marker is selected?
						_t._annotationEvents.push(on(annotation, 'update', this, function (args) {
							if (theInfoWindow.widgetId === widgetId) {
								_t._updateAnnotation(annotation, args.property, args.value);
							}
						}));

						if (theInfoWindow) {
							onShow();
							theInfoWindow.setContent(annotationNode);
						} else {
							theInfoWindow = new gmaps.InfoWindow({ content: annotationNode });
							gevent.addListener(theInfoWindow, 'domready', onShow);
							gevent.addListener(theInfoWindow, 'closeclick', function () {
								_t._hide(annotation, 'annotation');
							});
						}

						theInfoWindow.open(_t._gmap, annotation.marker);
						theInfoWindow.widgetId = annotation.widgetId;
					}
				},

				_hide: function (annotation, clicksource) {
					//console.log("Google.js:_hide");
					if (!clicksource || !~clicksource.indexOf('Button')) {
						theInfoWindow.close();
						theInfoWindow.widgetId = 0;
					}
					//this._dispatchEvents(annotation, clicksource);
				},

				_dispatchEvents: function (annotation, clicksource) {
					//console.log("Google.js:_dispatchEvents");
					if (!annotation.marker) {return;}
					var idx = this.annotations.indexOf(annotation),
						props = {
							annotation: annotation,
							clicksource: clicksource = clicksource || 'pin',
							index: idx,
							latitude: annotation.marker.getPosition().lat(),
							longitude: annotation.marker.getPosition().lng(),
							map: this,
							subtitle: annotation._getSubtitle(),
							title: annotation._getTitle(),
							itemId : annotation.itemId
						};

					fireEvent.call(this, 'singletap', props);
					fireEvent.call(this, 'click', props);
					annotation._onclick(this, idx, clicksource);
				},

				_getMarkerImage: function (a) {
					//console.log("Google.js:_getMarkerImage");
					var markerImg = markers[a.pincolor | 0];
					var	hash,
						blob;

					if (a.image) {
						//console.log("Google.js:_getMarkerImage 1 ");
						if (a.image.declaredClass === 'Ti.Blob') {
							//console.log("Google.js:_getMarkerImage 2 ");
							markerImg = markers[hash = Utils.md5HexDigest(blob = a.image.toString())];
							markerImg || (markerImg = markers[hash] = [new gmaps.MarkerImage(blob)]); //, new gmaps.Size(x1, 34), new point(x2, 0), new point(10, 34));
						} else {
							//console.log("Google.js:_getMarkerImage 3 ");
							markerImg = markers[a.image];
							markerImg || (markerImg = markers[a.image] = [new gmaps.MarkerImage(a.image)]);
						}
					} else {
						//console.log("Google.js:_getMarkerImage 4");
					}

					return markerImg;
				},

				_createMarker: function (a) {
					//console.log("Google.js:_createMarker");
					if ("marker" in a) {
						return; //Already a marker
					}

					var markerImg = this._getMarkerImage(a);

					a.mapView = this;
					a.evt = gevent.addListener(
						a.marker = new gmaps.Marker({
							map: this._gmap,
							icon: markerImg[0],
							position: new gmaps.LatLng(a.latitude, a.longitude),
							optimized: false,
							title: a._getTitle(),
							animation: a.animate && gmaps.Animation.DROP,
							draggable : a.draggable
						}),
						'click',
						lang.hitch(this, function () {
							this[theInfoWindow && theInfoWindow.widgetId === a.widgetId ? '_hide' : '_show'](a);
						}));

					var self = this;
					a.dragEndEvent = gevent.addListener(
						a.marker,
						'dragend',
						function() {
							a.latitude = a.marker.getPosition().lat();
							a.longitude = a.marker.getPosition().lng();
							a._ondragend(self);
						}
					);
					a.dragEvent = gevent.addListener(
						a.marker,
						'drag',
						function() {
							a.latitude = a.marker.getPosition().lat();
							a.longitude = a.marker.getPosition().lng();
							a._ondrag(self);
						}
					);
					a.dragStartEvent = gevent.addListener(
						a.marker,
						'dragstart',
						function() {
							a._ondragstart(self);
						}
					);

					this.__values__.properties.annotations.push(a);
				},

				_updateAnnotation : function(annotation, p, v) {
					//console.log("Google.js:_updateAnnotation");
					var markerImg,
						amap = this._annotationMap;
					switch (p) {
						case 'title':
						case 'subtitle':
							nodes[p].innerHTML = v;
							delete amap[args.oldValue];
							v && (amap[v] = annotation);
							break;
						case 'leftButton':
						case 'rightButton':
							nodes[p].src = v;
							break;
						case 'image':
						case 'pincolor':
							markerImg = this._getMarkerImage(annotation);
							annotation.marker.setIcon(markerImg[0]);
							annotation.marker.setShadow(markerImg[1] || null);
							break;
						case 'latitude' :
							annotation.marker.setPosition(new gmaps.LatLng(v, annotation.marker.getPosition().lng()));
							break;
						case 'longitude' :
							annotation.marker.setPosition(new gmaps.LatLng(annotation.marker.getPosition().lat(), v));
					}
				},

				_fitRegion: function () {
					//console.log("Google.js:_fitRegion");
					var c = this.__values__.constants,
						gmap = this._gmap,
						center = gmap.getCenter(),
						bounds = gmap.getBounds(),
						ne = bounds.getNorthEast(),
						sw = bounds.getSouthWest(),
						latD = c.latitudeDelta = ne.lat() - sw.lat(),
						lngD = c.longitudeDelta = ne.lng() - sw.lng(),
						region = {
							latitude: center.lat(),
							longitude: center.lng(),
							latitudeDelta: latD,
							longitudeDelta: lngD
						};

					this.regionFit && (this.__values__.properties.region = region);

					if (!this._initialized) {
						this._initialized = 1;
						this.fireEvent('complete');
					}

					if (isNaN(region.latitude) ||
						isNaN(region.longitude) ||
						isNaN(region.latitudeDelta) ||
						isNaN(region.longitudeDelta)) {
						return;
					}

					this.fireEvent('regionchanged', region);
				},

				_updateMap: function (region, dontAnimate) {
					//console.log("Google.js:_updateMap");
					var gmap = this._gmap;
					if (gmap) {
						var animated = !dontAnimate && this.animated,
							latD = region.latitudeDelta / 2.0,
							lngD = region.longitudeDelta / 2.0;
						gmap[animated ? 'panTo' : 'setCenter'](new gmaps.LatLng(region.latitude, region.longitude));
						gmap[animated ? 'panToBounds' : 'fitBounds'](new gmaps.LatLngBounds(
							new gmaps.LatLng(region.latitude - latD, region.longitude - lngD),
							new gmaps.LatLng(region.latitude + latD, region.longitude + lngD)
						));
					}
				},

				_updateUserLocation: function (userLocation) {
					//console.log("Google.js:_updateUserLocation");
					var gmap = this._gmap;
					if (gmap && (userLocation || this._locationInited)) {
						this._locationInited = 1;

						Geolocation[userLocation ? 'addEventListener' : 'removeEventListener']('location', lang.hitch(this, function (e) {
							var marker = this._locationMarker,
								coords = e.coords,
								code = e.code,
								pos;

							if (coords) {
								pos = new gmaps.LatLng(coords.latitude, coords.longitude);
								if (marker) {
									marker.setPosition(pos);
								} else {
									this._locationMarker = new gmaps.Marker({
										map: this._gmap,
										icon: locationMarkerImage,
										position: pos
									});
								}
							} else if ('code' in e) {
								Ti.API.warn('Geolocation error: ' + (code === Geolocation.ERROR_DENIED ? 'permission denied' : code === Geolocation.ERROR_TIMEOUT ? 'timeout' : code === Geolocation.ERROR_LOCATION_UNKNOWN ? 'position unavailable' : 'unknown'));
							}
						}));

						if (!Geolocation.locationServicesEnabled) {
							Ti.API.warn('Geolocation services unavailable');
							this.__values__.properties.userLocation = false;
						} else if (!userLocation || this._locationMarker) {
							this._locationMarker.setVisible(userLocation);
						}
					}
				},

				fireEvent: function (type, e) {
					//console.log("Google.js:fireEvent");
					/(click|singletap)/.test(type) || View.prototype.fireEvent.apply(this, arguments);
				},

				constants: {
					latitudeDelta: 0,
					longitudeDelta: 0
				},

				properties: {
					animated: false,
					annotations: {
						set: function (value) {
							value = value.filter(function (a) {
								return a && a.declaredClass === 'Ti.Map.Annotation';
							});
							if (this._gmap) {
								this.removeAllAnnotations();
								value.forEach(this._createMarker, this);
							}
							return value;
						}
					},
					mapType: {
						set: function (value) {
							this._gmap && this._gmap.setMapTypeId(mapType(value));
							return value;
						}
					},
					region: {
						set: function (newValue, oldValue) {
							return mix({}, defaultRegion, oldValue, newValue);
						},
						post: function (newValue, oldValue) {
							newValue !== oldValue && this._updateMap(newValue);
						},
						value: null
					},
					regionFit: true,
					userLocation: {
						post: function (value) {
							this._updateUserLocation(value);
						},
						value: false
					}
				}

			});

		window.TiMapViewInit = function () {
			gmaps = google.maps;
			gevent = gmaps.event;

			var i,
				prefix = 'themes/' + require.config.ti.theme + '/Map/',
				point = gmaps.Point;

			function makeMarker(color, x1, x2) {
				return new gmaps.MarkerImage(prefix + 'marker_' + color + '.png', new gmaps.Size(x1, 34), new point(x2, 0), new point(10, 34));
			}

			for (i in markers) {
				markers[i] = [makeMarker(markers[i], 20, 0), makeMarker(markers[i], 37, 20)];
			}

			locationMarkerImage = new gmaps.MarkerImage(prefix + 'location.png', new gmaps.Size(22, 22), new point(0, 0), new point(11, 11));

			onload();
		};

		require(['//maps.googleapis.com/maps/api/js?key=' + Properties.getString('ti.map.apikey', '') + '&sensor=true&callback=TiMapViewInit'], 0, onload);

		return MapView;

	});