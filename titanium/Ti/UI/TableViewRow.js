/*global define*/
define(['Ti/_/declare', 'Ti/_/lang', 'Ti/UI/View', 'Ti/_/dom', 'Ti/_/css', 'Ti/_/style', 'Ti/UI', 'Ti/_/Layouts/ConstrainingHorizontal'],
	function(declare, lang, View, dom, css, style, UI, ConstrainingHorizontal) {

	var isDef = lang.isDef,
		imagePrefix = 'themes/' + require.config.ti.theme + '/UI/TableViewRow/',
		checkImage = imagePrefix + 'check.png',
		childImage = imagePrefix + 'child.png',
		detailImage = imagePrefix + 'detail.png',
		eventFilter = /(click|singletap|longpress)/;

	return declare('Ti.UI.TableViewRow', View, {

		// The number of pixels 1 indention equals
		_indentionScale: 10,
        _centerContainer:undefined,

		constructor: function() {
			this._layout = new ConstrainingHorizontal({ element: this });

		},

        _addCenterContainer : function() {

            this._centerContainer = UI.createView({
                width: UI.INHERIT,
                height: UI.INHERIT
            });

            if (!isDef(this._leftImageView) && !isDef(this._rightImageView)) {
                this._add(this._centerContainer);
            } else if (isDef(this._leftImageView) && isDef(this._rightImageView)) {
                this._insertAt(this._centerContainer, 1);
            } else if (!isDef(this._leftImageView) && isDef(this._rightImageView)) {
                this._insertAt(this._centerContainer, 0);
            }

            this._centerContainer._add(this._contentContainer = UI.createView({
                width: UI.INHERIT,
                height: UI.INHERIT
            }));


        },

        _addLeftImageView : function() {

			if (!isDef(this._centerContainer)) {
				this._addCenterContainer();
			}

            this._leftImageView = UI.createImageView({
                width: UI.SIZE,
                height: UI.SIZE
            });

            if (this._centerContainer) {
                this._insertAt(this._leftImageView, 0);
            } else {
                this._add(this._leftImageView);
            }

			this._leftImageView.left = this._marginLeft;
        },

        _addRightImageView : function() {

            this._rightImageView = UI.createImageView({
                right: 0,
                width: UI.SIZE,
                height: UI.SIZE
            });
            this._add(this._rightImageView);
        },

        _addTitleLabel : function() {
            if (!isDef(this._centerContainer)) {
                this._addCenterContainer();
            }
            this._centerContainer._add(this._titleLabel = UI.createLabel({
                width: UI.INHERIT,
                height: UI.INHERIT,
                wordWrap: false
            }));
        },

		_defaultWidth: UI.INHERIT,

		_defaultHeight: UI.SIZE,

		_tableRowHeight: void 0,

		_tableViewSection: null,

		fireEvent: function(type) {
			if (eventFilter.test(type)) {
				this._tableViewSection && this._tableViewSection._tableView && (this._tableViewSection._tableView._tableViewRowClicked = this);
			}
			View.prototype.fireEvent.apply(this, arguments);
		},

		_doBackground: function() {
			if (this._touching && isDef(this._titleLabel)) {
				this._titleLabel.color = this.selectedColor;
			} else if(isDef(this._titleLabel)) {
				this._titleLabel.color = this.color;
			}
			View.prototype._doBackground.apply(this, arguments);
		},

		_updatePadding: function() {
			// Fake padding with a transparent border
			if (!isDef(this._centerContainer)) {
				return;
			}
			this._contentContainer.borderWidth = [this.leftImage ? 5 : 0, this.rightImage ? 5 : 0, 0, 0];
            if (this._titleLabel) {
                this._titleLabel.borderWidth = this._contentContainer.borderWidth;
            }
		},

		add: function(view) {
			if (!isDef(this._centerContainer)) {
				this._addCenterContainer();
			}

			this._contentContainer._add(view);
			this._publish(view);
		},

		remove: function(view) {
			if (!isDef(this._centerContainer)) {
				return;
			}
			this._contentContainer._remove(view);
			this._unpublish(view);
		},

		properties: {
			className: void 0,
			color: {
				set: function(value) {
                    //if (!isDef(this._titleLabel)) {
                        //this._addTitleLabel();
                    //}
					if (isDef(this._titleLabel)) {
						this._titleLabel.color = value;
					}
					return value;
				}
			},
			hasCheck: {
				set: function(value, oldValue) {
					if (value !== oldValue && !isDef(this.rightImage) && !this.hasChild) {
						if (!isDef(this._rightImageView)) {
							this._addRightImageView();
						}
						this._rightImageView.image = value ? checkImage : '';
					}
					return value;
				}
			},
			hasChild: {
				set: function(value, oldValue) {
					if (value !== oldValue && !isDef(this.rightImage) && isDef(this._rightImageView)) {
						if (!isDef(this._rightImageView)) {
							this._addRightImageView();
						}
						this._rightImageView.image = value ? childImage : '';
					}
					return value;
				}
			},
			hasDetail: {
				set: function(value, oldValue) {
					if (value !== oldValue && !isDef(this.rightImage) && !this.hasChild && !this.hasCheck) {
						if (!isDef(this._rightImageView)) {
							this._addRightImageView();
						}
						this._rightImageView.image = value ? detailImage : '';
					}
					return value;
				}
			},
			indentionLevel: {
				set: function(value) {
                    if (isDef(this._leftImageView)) {
					    this._leftImageView.left = value * this._indentionScale;
                    }
					return value;
				},
				value: 0
			},
			layout: {
				set: function(value) {
					this._contentContainer.layout = value;
				}
			},
			leftImage: {
				set: function(value, oldValue) {
					if (value !== oldValue) {
                        if (!isDef(this._leftImageView)) {
                            this._addLeftImageView();
                        }
						this._leftImageView.image = value;
					}
					return value;
				},
				post: '_updatePadding'
			},
			rightImage: {
				set: function(value, oldValue) {
					if (value !== oldValue) {
                        if (!isDef(this._rightImageView)) {
                            this._addRightImageView();
                        }
						this._rightImageView.image = value;
					}
					return value;
				},
				post: '_updatePadding'
			},
			selectedColor: void 0,
			title: {
				set: function(value) {
					//console.log("TableViewRow set title label = " + value);
					if (value && value != "") {
						if (!isDef(this._titleLabel)) {
							this._addTitleLabel();
						}
					}
					if (this._titleLabel) {
						this._titleLabel.text = value;
					}
					return value;
				}
			},

			// Pass through to the label
			font: {
				set: function(value) {
                    if (!isDef(this._titleLabel)) {
                        this._addTitleLabel();
                   	}
					this._titleLabel.font = value;
					return value;
				}
			},
			left : {
				set : function(value) {
					if (isDef(this._leftImageView)) {
						this._leftImageView.left = value;
					}
					if (isDef(this._centerContainer)) {
						this._centerContainer.left = value;
					}
					if (isDef(this._rightImageView)) {
						this._rightImageView.left = value;
					}
					if (isDef(this._leftImageView) || isDef(this._centerContainer) || isDef(this._rightImageView)) {
						return 0;
					} else {
						return value;
					}
				}
			}
		}

	});

});