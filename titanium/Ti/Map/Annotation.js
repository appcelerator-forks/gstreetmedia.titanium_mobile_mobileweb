define(["Ti/_/declare", "Ti/_/Evented", "Ti/Locale"], function(declare, Evented, Locale) {



	var updateHook = {
		post: function(newValue, oldValue, prop) {
			if (this.mapView && this.marker) {
				this.mapView._updateAnnotation(this, prop, newValue);
			} else {
				//console.log("either no mapView or no marker");
			}
			this.fireEvent("update", {
				property: prop,
				value: newValue,
				oldValue: oldValue
			});
		}
	};

	return declare("Ti.Map.Annotation", Evented, {

		_onclick: function(mapview, idx, src) {
			this.fireEvent("click", {
				annotation: this,
				clicksource: src,
				index: idx,
				map: mapview,
				title: this.title,
				itemId : this.itemId
			});
		},

		_ondragstart: function(mapview) {
			this.fireEvent("pinchangedragstate", {
				annotation: this,
				map: mapview,
				title: this.title,
				type : "pinchangedragstate",
				newState : Ti.Map.ANNOTATION_DRAG_STATE_START,
				itemId : this.itemId
			});
		},

		_ondrag : function(mapview) {
			this.fireEvent("pinchangedragstate", {
				annotation: this,
				map: mapview,
				title: this.title,
				type : "pinchangedragstate",
				newState : Ti.Map.ANNOTATION_DRAG_STATE_DRAG,
				itemId : this.itemId
			});
		},

		_ondragend: function(mapview) {
			this.fireEvent("pinchangedragstate", {
				annotation: this,
				map: mapview,
				title: this.title,
				type : "pinchangedragstate",
				newState : Ti.Map.ANNOTATION_DRAG_STATE_END,
				itemId : this.itemId
			});
		},

		//ANNOTATION_DRAG_STATE_START : 0,
		//ANNOTATION_DRAG_STATE_END : 1

		//marker : null, //Set/Created by Google.js in _createMarker

		//mapView : null, //Set/Created by Google.js in _createMarker

		_update: function() {},

		_getTitle: function() {
			return Locale._getString(this.titleid, this.title);
		},

		_getSubtitle: function() {
			return Locale._getString(this.subtitleid, this.subtitle);
		},

		_getImage : function() {
			return this.image;
		},

		properties: {
			animate: false,
			image: updateHook,
			latitude: updateHook,
			longitude: updateHook,
			leftButton: updateHook,
			pincolor: updateHook,
			rightButton: updateHook,
			subtitle: updateHook,
			subtitleid: updateHook,
			title: updateHook,
			titleid: updateHook,
			draggable : updateHook,
			itemId : updateHook
		}

	});

});
