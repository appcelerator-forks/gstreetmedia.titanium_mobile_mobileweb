/*global define*/
define(['Ti/_/declare', 'Ti/_/lang', 'Ti/_/UI/Widget', 'Ti/_/style','Ti/UI/MobileWeb/TableViewSeparatorStyle', 'Ti/UI'],
	function(declare, lang, Widget, style, TableViewSeparatorStyle, UI) {

	var is = require.is,
		setStyle = style.set,
		separatorImage,
		eventFilter = /(click|singletap|longpress)/;

	return declare('Ti.UI.TableViewSection', Widget, {

		constructor: function() {
			this._indexedContent = [];

			var i = 0,
				l = 3,
				a = ['_header', '_rows', '_footer'];

			while (i < l) {
				this._add(this[a[i++]] = UI.createView({
					height: UI.SIZE,
					width: UI.INHERIT,
					layout: UI._LAYOUT_CONSTRAINING_VERTICAL
				}));
			}

			// Create the parts out of Ti controls so we can make use of the layout system
			this.layout = UI._LAYOUT_CONSTRAINING_VERTICAL;
		},

		_defaultWidth: UI.INHERIT,

		_defaultHeight: UI.SIZE,

		fireEvent: function(type) {
			if (eventFilter.test(type)) {
				this._tableView && (this._tableView._tableViewSectionClicked = this);
			}
			Widget.prototype.fireEvent.apply(this,arguments);
		},

		_tableView: null,
		/*
		_createSeparator: function() {
			var showSeparator = this._tableView && this._tableView.separatorStyle === TableViewSeparatorStyle.SINGLE_LINE,
				separator = UI.createView({
					height: showSeparator ? 1 : 0,
					width: UI.INHERIT,
					backgroundColor: showSeparator ? this._tableView.separatorColor : 'transparent'
				});
			setStyle(separator.domNode,'minWidth','100%'); // Temporary hack until TIMOB-8124 is completed.
			return separator;
		},
		*/
		_createSeparator: function(view) {
			var showSeparator = this._tableView && this._tableView.separatorStyle === TableViewSeparatorStyle.SINGLE_LINE;
			if (!showSeparator) {
				//console.log("TableViewSection::_createSeparator No Separator");
				//console.log("TableViewSection::_createSeparator this._tableView =>" + this._tableView);
				//console.log("TableViewSection::_createSeparator this._tableView.separatorStyle => " +  this._tableView.separatorStyle);
				return;
			}
			setStyle(view.domNode, {
				borderLeftWidth: 0,
				borderRightWidth: 0,
				borderTopWidth: 0,
				borderBottomWidth: "1px",
				borderColor :  this._tableView.separatorColor,
				"-moz-box-sizing": "border-box",
				"-webkit-box-sizing" : "border-box",
				"box-sizing": "border-box"
			});
		},

		_createDecorationLabel: function(text) {
			return UI.createLabel({
				text: text,
				backgroundColor: 'darkGrey',
				color: 'white',
				width: UI.INHERIT,
				height: UI.SIZE,
				left: 0,
				font: {fontSize: 18}
			});
		},

		_refreshRows: function() {
			if (this._tableView) {
				// Update the row information
				var rows = this._rows._children,
					tableView = this._tableView,
					rowsData = this.__values__.constants.rows = [],
					i,
					row;

				for (i = 0; i < rows.length; i++) {
					row = rows[i];
					row._defaultHeight = tableView.rowHeight;
					row._minHeight = tableView.minRowHeight;
					row._maxHeight = tableView.maxRowHeight;
					rowsData.push(row);
				}
			}
		},

		_insertHelper: function(value, index) {
			if (!lang.isDef(value.declaredClass) || value.declaredClass != 'Ti.UI.TableViewRow') {
				value = UI.createTableViewRow(value);
			}

			this._createSeparator(value);

			this._rows._insertAt(value, index);
			value._tableViewSection = this;
			this.rowCount++;
			this._refreshRows();
		},

		add: function(value, index) {

			var rows = this._rows._children,
				rowCount = this.rowCount;
			if (!lang.isDef(index)) {
				index = rowCount;
			}
			if (index < 0 || index > rowCount) {
				return;
			}

			if (is(value,'Array')) {
				for (var i in value) {
					this._insertHelper(value[i],index++);
				}
			} else {
				this._insertHelper(value,index);
			}
		},

		_removeAt: function(index) {
			if (index < 0 || index >= this.rowCount) {
				return;
			}
			this._rows._children[index]._tableViewSection = null;
			this._rows.remove(this._rows._children[index]); // Remove the row

			// Remove the last separator, if there are no rows left
			if (this._rows._children.length === 1) {
				this._rows.remove(this._rows._children[0]);
			}
			this._refreshRows();
		},

		remove: function(view) {
			var index = this._rows._children.indexOf(view);
			if (index === -1) {
				return;
			}

			this._removeAt(index);
		},

		constants: {
			rows: void 0
		},

		properties: {
			footerTitle: {
				set: function(value, oldValue) {
					if (oldValue != value) {
						this._footer._removeAllChildren();
						this._footer._add(this._createDecorationLabel(value));
						//this._footer._add(this._createSeparator());
					}
					return value;
				}
			},
			footerView: {
				set: function(value, oldValue) {
					if (oldValue != value) {
						this._footer._removeAllChildren();
						this._footer._add(value);
					}
					return value;
				}
			},
			headerTitle: {
				set: function(value, oldValue) {
					if (oldValue != value) {
						this._header._removeAllChildren();
						this._header._add(this._createDecorationLabel(value));
						//this._header._add(this._createSeparator());
					}
					return value;
				}
			},
			headerView: {
				set: function(value, oldValue) {
					if (oldValue != value) {
						this._header._removeAllChildren();
						this._header._add(value);
					}
					return value;
				}
			},

			rowCount: function() {
				return Math.floor(this._rows._children.length);
			}
		}

	});

});