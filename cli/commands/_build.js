/*
 * build.js: Titanium Mobile Web CLI build command
 *
 * Copyright (c) 2012-2013, Appcelerator, Inc.  All Rights Reserved.
 * See the LICENSE file for more information.
 */

var ti = require('titanium-sdk'),
	appc = require('node-appc'),
	i18n = appc.i18n(__dirname),
	__ = i18n.__,
	__n = i18n.__n,
	cleanCSS = require('clean-css'),
	afs = appc.fs,
	parallel = appc.async.parallel,
	UglifyJS = require('uglify-js'),
	fs = require('fs'),
	path = require('path'),
	wrench = require('wrench'),
	jsExtRegExp = /\.js$/,
	HTML_HEADER = [
		'<!--',
		'	WARNING: this is generated code and will be lost if changes are made.',
		'	This generated source code is Copyright (c) 2010-' + (new Date).getFullYear() + ' by Appcelerator, Inc. All Rights Reserved.',
		'	-->'
		].join('\n'),
	HEADER = [
		'/**',
		' * WARNING: this is generated code and will be lost if changes are made.',
		' * This generated source code is Copyright (c) 2010-' + (new Date).getFullYear() + ' by Appcelerator, Inc. All Rights Reserved.',
		' */'
		].join('\n'),
	imageMimeTypes = {
		'.png': 'image/png',
		'.gif': 'image/gif',
		'.jpg': 'image/jpg',
		'.jpeg': 'image/jpg'
	};

// silence uglify's default warn mechanism
UglifyJS.AST_Node.warn_function = function () {};

exports.config = function (logger, config, cli) {
	return function (finished) {
		cli.createHook('build.mobileweb.config', function (callback) {
			callback(null, {
				options: {
					'deploy-type': {
						abbr: 'D',
						default: 'development',
						desc: __('the type of deployment; production performs optimizations'),
						hint: __('type'),
						values: ['production', 'development']
					}
				}
			});
		})(function (err, result) {
			finished(result);
		});
	};
};

exports.validate = function (logger, config, cli) {
	// nothing to do!
};

exports.run = function (logger, config, cli, finished) {
	cli.fireHook('build.pre.construct', function () {
		new build(logger, config, cli, function (err) {
			cli.fireHook('build.post.compile', this, function (e) {
				if (e && e.type == 'AppcException') {
					logger.error(e.message);
					e.details.forEach(function (line) {
						line && logger.error(line);
					});
				}

				cli.addAnalyticsEvent('mobileweb.build.' + cli.argv['deploy-type'], {
					dir: cli.argv['project-dir'],
					name: cli.tiapp.name,
					publisher: cli.tiapp.publisher,
					url: cli.tiapp.url,
					image: cli.tiapp.icon,
					appid: cli.tiapp.id,
					description: cli.tiapp.description,
					type: cli.argv.type,
					guid: cli.tiapp.guid,
					version: cli.tiapp.version,
					copyright: cli.tiapp.copyright,
					date: (new Date()).toDateString()
				});

				cli.fireHook('build.finalize', this, function () {
					finished(err);
				});
			}.bind(this));
		});
	});
};

function build(logger, config, cli, finished) {
	logger.info(__('Compiling "%s" build', cli.argv['deploy-type']));

	this.logger = logger;
	this.deployType = cli.argv['deploy-type'];
	this.os = cli.env.os;
	this.tiapp = cli.tiapp;

	this.titaniumSdkVersion = ti.manifest.version;
	this.projectDir = afs.resolvePath(cli.argv['project-dir']);
	this.projectResDir = this.projectDir + '/Resources';
	this.buildDir = this.projectDir + '/build/mobileweb';
	this.mobilewebSdkPath = afs.resolvePath(path.dirname(module.filename), '..', '..');
	this.mobilewebThemeDir = this.mobilewebSdkPath + '/themes';
	this.mobilewebTitaniumDir = this.mobilewebSdkPath + '/titanium';

	this.moduleSearchPaths = [ this.projectDir, afs.resolvePath(this.mobilewebSdkPath, '..', '..', '..', '..') ];
	if (config.paths && Array.isArray(config.paths.modules)) {
		this.moduleSearchPaths = this.moduleSearchPaths.concat(config.paths.modules);
	}

	this.projectDependencies = [];
	this.modulesToLoad = [];
	this.tiModulesToLoad = [];
	this.requireCache = {};
	this.moduleMap = {};
	this.modulesToCache = [
		'Ti/_/image',
		'Ti/_/include'
	];
	this.precacheImages = [];
	this.locales = [];
	this.appNames = {};
	this.splashHtml = '';

	var pkgJson = this.readTiPackageJson();
	this.packages = [{
		name: pkgJson.name,
		location: './titanium',
		main: pkgJson.main
	}];

	if (!this.dependenciesMap) {
		this.dependenciesMap = JSON.parse(fs.readFileSync(path.join(this.mobilewebTitaniumDir, 'dependencies.json')));
	}

	// read the tiapp.xml and initialize some sensible defaults
	applyDefaults(this.tiapp, {
		mobileweb: {
			analytics: {
				'use-xhr': false
			},
			build: {},
			'disable-error-screen': false,
			filesystem: {
				backend: '', // blank defaults to Ti/_/Filesystem/Local
				registry: 'ondemand'
			},
			map: {
				backend: '', // blank defaults to Ti/_/Map/Google
				apikey: ''
			},
			splash: {
				enabled: true,
				'inline-css-images': true
			},
			theme: 'default'
		}
	});

	this.validateTheme();

	var mwBuildSettings = this.tiapp.mobileweb.build[this.deployType];
	this.minifyJS = mwBuildSettings && mwBuildSettings.js ? !!mwBuildSettings.js.minify : this.deployType == 'production';

	cli.fireHook('build.pre.compile', this, function (e) {
		// Make sure we have an app.js. This used to be validated in validate(), but since plugins like
		// Alloy generate an app.js, it may not have existed during validate(), but should exist now
		// that build.pre.compile was fired.
		ti.validateAppJsExists(this.projectDir, this.logger, 'mobileweb');

		// Note: code processor is a pre-compile hook
		this.codeProcessor = cli.codeProcessor;

		parallel(this, [
			'copyFiles',
			'findProjectDependencies'
		], function () {
			parallel(this, [
				'createIcons',
				'findModulesToCache',
				'findPrecacheModules',
				'findPrecacheImages',
				'findTiModules',
				'findI18N'
			], function () {
				parallel(this, [
					'findDistinctCachedModules',
					'detectCircularDependencies'
				], function () {
					this.logger.info(
						__n('Found %s dependency', 'Found %s dependencies', this.projectDependencies.length) + ', ' +
						__n('%s package', '%s packages', this.packages.length) + ', ' +
						__n('%s module', '%s modules', this.modulesToCache.length)
					);
					parallel(this, [
						'assembleTitaniumJS',
						'assembleTitaniumCSS'
					], function () {
						this.minifyJavaScript();
						this.createFilesystemRegistry();
						this.createIndexHtml();
						finished && finished.call(this);
					});
				});
			});
		});
	}.bind(this));
}

build.prototype = {

	readTiPackageJson: function () {
		this.logger.info(__('Reading Titanium Mobile Web package.json file'));
		var mwPackageFile = this.mobilewebSdkPath + '/titanium/package.json';
		afs.exists(mwPackageFile) || badInstall(__('Unable to find Titanium Mobile Web package.json file'));
		try {
			return JSON.parse(fs.readFileSync(mwPackageFile));
		} catch (e) {
			badInstall(__("Unable to parse Titanium Mobile Web's package.json file"));
		}
	},

	validateTheme: function () {
		this.logger.info(__('Validating theme'));
		this.theme = this.tiapp.mobileweb.theme || 'default';
		if (!afs.exists(this.mobilewebThemeDir + '/' + this.theme)) {
			logger.error(__('Unable to find the "%s" theme. Please verify the theme setting in the tiapp.xml.', this.theme) + '\n');
			process.exit(1);
		}
		this.logger.debug(__('Using %s theme', this.theme.cyan));
	},

	copyFiles: function (callback) {
		this.logger.info(__('Copying project files'));
		if (afs.exists(this.buildDir)) {
			this.logger.debug(__('Deleting existing build directory'));
			try {
				wrench.rmdirSyncRecursive(this.buildDir);
			} catch (e) {
				this.logger.error(__('Failed to remove build directory "%s".', this.buildDir));
				if (e.message.indexOf('resource busy or locked') != -1) {
					this.logger.error(__('Build directory is busy or locked'));
					this.logger.error(__('Check that you don\'t have any terminal sessions or programs with open files in the build directory') + '\n');
				} else {
					this.logger.error(e.message + '\n');
				}
				process.exit(1);
			}
		}
		wrench.mkdirSyncRecursive(this.buildDir);
		afs.copyDirSyncRecursive(this.mobilewebThemeDir, this.buildDir + '/themes', { preserve: true, logger: this.logger.debug });
		afs.copyDirSyncRecursive(this.mobilewebTitaniumDir, this.buildDir + '/titanium', { preserve: true, logger: this.logger.debug });
		afs.copyDirSyncRecursive(this.projectResDir, this.buildDir, { preserve: true, logger: this.logger.debug, rootIgnore: ti.filterPlatforms('mobileweb') });
		if (afs.exists(this.projectResDir, 'mobileweb')) {
			afs.copyDirSyncRecursive(this.projectResDir + '/mobileweb', this.buildDir, { preserve: true, logger: this.logger.debug, rootIgnore: ['apple_startup_images', 'splash'] });
			['Default.jpg', 'Default-Portrait.jpg', 'Default-Landscape.jpg'].forEach(function (file) {
				file = this.projectResDir + '/mobileweb/apple_startup_images/' + file;
				if (afs.exists(file)) {
					afs.copyFileSync(file, this.buildDir, { logger: this.logger.debug });
					afs.copyFileSync(file, this.buildDir + '/apple_startup_images', { logger: this.logger.debug });
				}
			}, this);
		}
		callback();
	},

	findProjectDependencies: function (callback) {
		var i, len,
			plugins,
			usedAPIs,
			p,
			logger = this.logger;
		logger.info(__('Finding all Titanium API dependencies'));
		if (this.codeProcessor && this.codeProcessor.plugins) {
			plugins = this.codeProcessor.plugins;
			for (i = 0, len = plugins.length; i < len; i++) {
				if (plugins[i].name === 'ti-api-usage-finder') {
					usedAPIs = plugins[i].global,
					this.projectDependencies = ['Ti'];
					for(p in usedAPIs) {
						p = p.replace('Titanium', 'Ti').replace(/\./g,'/');
						if (p in this.dependenciesMap && !~this.projectDependencies.indexOf(p)) {
							logger.debug(__('Found Titanium API module: ') + p.replace('Ti', 'Titanium').replace(/\//g, '.'));
							this.projectDependencies.push(p);
						}
					}
					break;
				}
			}
		} else {
			this.projectDependencies = Object.keys(this.dependenciesMap);
		}
		callback();
	},

	findModulesToCache: function (callback) {
		this.logger.info(__('Finding all required modules to be cached'));
		this.projectDependencies.forEach(function (mid) {
			this.parseModule(mid);
		}, this);
		this.modulesToCache = this.modulesToCache.concat(Object.keys(this.requireCache));
		callback();
	},

	findPrecacheModules: function (callback) {
		this.logger.info(__('Finding all precached modules'));
		var mwTiapp = this.tiapp.mobileweb;
		if (mwTiapp.precache) {
			mwTiapp.precache.require && mwTiapp.precache.require.forEach(function (x) {
				this.modulesToCache.push('commonjs:' + x);
			}, this);
			mwTiapp.precache.includes && mwTiapp.precache.includes.forEach(function (x) {
				this.modulesToCache.push('url:' + x);
			}, this);
		}
		callback();
	},

	findDistinctCachedModules: function (callback) {
		this.logger.info(__('Finding all distinct cached modules'));
		var depMap = {};
		this.modulesToCache.forEach(function (m) {
			for (var i in this.moduleMap) {
				if (this.moduleMap.hasOwnProperty(i) && this.moduleMap[i].indexOf(m) != -1) {
					depMap[m] = 1;
				}
			}
		}, this);
		Object.keys(this.moduleMap).forEach(function (m) {
			depMap[m] || this.modulesToLoad.push(m);
		}, this);
		callback();
	},

	findPrecacheImages: function (callback) {
		this.logger.info(__('Finding all precached images'));
		this.moduleMap['Ti/UI/TableViewRow'] && this.precacheImages.push('/themes/' + this.theme + '/UI/TableViewRow/child.png');
		var images = (this.tiapp.mobileweb.precache && this.tiapp.mobileweb.precache.images) || [];
		images && (this.precacheImages = this.precacheImages.concat(images));
		callback();
	},

	findTiModules: function (callback) {
		if (!this.tiapp.modules || !this.tiapp.modules.length) {
			this.logger.info(__('No Titanium Modules required, continuing'));
			callback();
			return;
		}

		this.logger.info(__n('Searching for %s Titanium Module', 'Searching for %s Titanium Modules', this.tiapp.modules.length));
		appc.timodule.find(this.tiapp.modules, 'mobileweb', this.deployType, this.titaniumSdkVersion, this.moduleSearchPaths, this.logger, function (modules) {
			if (modules.missing.length) {
				this.logger.error(__('Could not find all required Titanium Modules:'));
				modules.missing.forEach(function (m) {
					this.logger.error('   id: ' + m.id + '\t version: ' + (m.version || 'latest') + '\t platform: ' + m.platform + '\t deploy-type: ' + m.deployType);
				}, this);
				this.logger.log();
				process.exit(1);
			}

			if (modules.incompatible.length) {
				this.logger.error(__('Found incompatible Titanium Modules:'));
				modules.incompatible.forEach(function (m) {
					this.logger.error('   id: ' + m.id + '\t version: ' + (m.version || 'latest') + '\t platform: ' + m.platform + '\t min sdk: ' + m.minsdk);
				}, this);
				this.logger.log();
				process.exit(1);
			}

			if (modules.conflict.length) {
				this.logger.error(__('Found conflicting Titanium modules:'));
				modules.conflict.forEach(function (m) {
					this.logger.error('   ' + __('Titanium module "%s" requested for both Mobile Web and CommonJS platforms, but only one may be used at a time.', m.id));
				}, this);
				this.logger.log();
				process.exit(1);
			}

			modules.found.forEach(function (module) {
				var moduleDir = module.modulePath,
					pkgJson,
					pkgJsonFile = path.join(moduleDir, 'package.json');
				if (!afs.exists(pkgJsonFile)) {
					this.logger.error(__('Invalid Titanium Mobile Module "%s": missing package.json', module.id) + '\n');
					process.exit(1);
				}

				try {
					pkgJson = JSON.parse(fs.readFileSync(pkgJsonFile));
				} catch (e) {
					this.logger.error(__('Invalid Titanium Mobile Module "%s": unable to parse package.json', module.id) + '\n');
					process.exit(1);
				}

				var libDir = ((pkgJson.directories && pkgJson.directories.lib) || '').replace(/^\//, '');

				var mainFilePath = path.join(moduleDir, libDir, (pkgJson.main || '').replace(jsExtRegExp, '') + '.js');
				if (!afs.exists(mainFilePath)) {
					this.logger.error(__('Invalid Titanium Mobile Module "%s": unable to find main file "%s"', module.id, pkgJson.main) + '\n');
					process.exit(1);
				}

				this.logger.info(__('Bundling Titanium Mobile Module %s', module.id.cyan));

				this.projectDependencies.push(pkgJson.main);

				var moduleName = module.id != pkgJson.main ? module.id + '/' + pkgJson.main : module.id;

				if (/\/commonjs/.test(moduleDir)) {
					this.modulesToCache.push((/\/commonjs/.test(moduleDir) ? 'commonjs:' : '') + moduleName);
				} else {
					this.modulesToCache.push(moduleName);
					this.tiModulesToLoad.push(module.id);
				}

				this.packages.push({
					'name': module.id,
					'location': './' + this.collapsePath('modules/' + module.id + (libDir ? '/' + libDir : '')),
					'main': pkgJson.main,
					'root': 1
				});

				// TODO: need to combine ALL Ti module .js files into the titanium.js, not just the main file

				// TODO: need to combine ALL Ti module .css files into the titanium.css

				var dest = path.join(this.buildDir, 'modules', module.id);
				wrench.mkdirSyncRecursive(dest);
				afs.copyDirSyncRecursive(moduleDir, dest, { preserve: true });
			}, this);

			callback();
		}.bind(this));
	},

	detectCircularDependencies: function (callback) {
		this.modulesToCache.forEach(function (m) {
			var deps = this.moduleMap[m];
			deps && deps.forEach(function (d) {
				if (this.moduleMap[d] && this.moduleMap[d].indexOf(m) != -1) {
					this.logger.warn(__('Circular dependency detected: %s dependent on %s'), m, d);
				}
			}, this);
		}, this);
		callback();
	},

	findI18N: function (callback) {
		var data = ti.i18n.load(this.projectDir, this.logger),
			precacheLocales = (this.tiapp.mobileweb.precache || {}).locales || [];

		Object.keys(data).forEach(function (lang) {
			data[lang].app && data[lang].appname && (self.appNames[lang] = data[lang].appname);
			if (data[lang].strings) {
				var dir = path.join(this.buildDir, 'titanium', 'Ti', 'Locale', lang);
				wrench.mkdirSyncRecursive(dir);
				fs.writeFileSync(path.join(dir, 'i18n.js'), 'define(' + JSON.stringify(data[lang].strings, null, '\t') + ');');
				this.locales.push(lang);
				precacheLocales.indexOf(lang) != -1 && this.modulesToCache.push('Ti/Locale/' + lang + '/i18n');
			};
		}, this);

		callback();
	},

	assembleTitaniumJS: function (callback) {
		this.logger.info(__('Assembling titanium.js'));

		var tiapp = this.tiapp,
			tiJS = [
				HEADER, '\n',

				// 1) read in the config.js and fill in the template
				renderTemplate(fs.readFileSync(this.mobilewebSdkPath + '/src/config.js').toString(), {
					app_analytics: tiapp.analytics,
					app_copyright: tiapp.copyright,
					app_description: tiapp.description,
					app_guid: tiapp.guid,
					app_id: tiapp.id,
					app_name: tiapp.name,
					app_names: JSON.stringify(this.appNames),
					app_publisher: tiapp.publisher,
					app_url: tiapp.url,
					app_version: tiapp.version,
					deploy_type: this.deployType,
					locales: JSON.stringify(this.locales),
					packages: JSON.stringify(this.packages),
					project_id: tiapp.id,
					project_name: tiapp.name,
					ti_fs_registry: tiapp.mobileweb.filesystem.registry,
					ti_theme: this.theme,
					ti_githash: ti.manifest.githash,
					ti_timestamp: ti.manifest.timestamp,
					ti_version: ti.manifest.version,
					has_analytics_use_xhr: tiapp.mobileweb.analytics ? tiapp.mobileweb.analytics['use-xhr'] === true : false,
					has_show_errors: this.deployType != 'production' && tiapp.mobileweb['disable-error-screen'] !== true,
					has_instrumentation: !!tiapp.mobileweb.instrumentation,
					has_allow_touch: tiapp.mobileweb.hasOwnProperty('allow-touch') ? !!tiapp.mobileweb['allow-touch'] : true
				}),

				'\n', '\n'
			];

		// 2) copy in instrumentation if it's enabled
		!tiapp.mobileweb.instrumentation || tiJS.push(fs.readFileSync(this.mobilewebSdkPath + '/src/instrumentation.js').toString() + '\n');

		// 3) copy in the loader
		tiJS.push(fs.readFileSync(this.mobilewebSdkPath + '/src/loader.js').toString() + '\n\n');

		// 4) cache the dependencies
		var first = true,
			requireCacheWritten = false,
			moduleCounter = 0;

		// uncomment next line to bypass module caching (which is ill advised):
		// this.modulesToCache = [];

		this.modulesToCache.forEach(function (moduleName) {
			var isCommonJS = false;
			if (/^commonjs\:/.test(moduleName)) {
				isCommonJS = true;
				moduleName = moduleName.substring(9);
			}

			var dep = this.resolveModuleId(moduleName);
			if (!dep.length) return;

			if (!requireCacheWritten) {
				tiJS.push('require.cache({\n');
				requireCacheWritten = true;
			}

			first || tiJS.push(',\n');
			first = false;
			moduleCounter++;

			var file = path.join(dep[0], jsExtRegExp.test(dep[1]) ? dep[1] : dep[1] + '.js');

			if (/^url\:/.test(moduleName)) {
				if (this.minifyJS) {
					var source = file + '.uncompressed.js';
					fs.renameSync(file, source);
					this.logger.debug(__('Minifying include %s', file));
					try {
						fs.writeFileSync(file, UglifyJS.minify(source).code);
					} catch (ex) {
						this.logger.error(__('Failed to minify %s', source));
						if (ex.line) {
							this.logger.error(__('%s [line %s, column %s]', ex.message, ex.line, ex.col));
						} else {
							this.logger.error(__('%s', ex.message));
						}
						try {
							var contents = fs.readFileSync(source).toString().split('\n');
							if (ex.line && ex.line <= contents.length) {
								this.logger.error('');
								this.logger.error('    ' + contents[ex.line-1]);
								if (ex.col) {
									var i = 0,
										len = ex.col;
										buffer = '    ';
									for (; i < len; i++) {
										buffer += '-';
									}
									this.logger.error(buffer + '^');
								}
								this.logger.log();
							}
						} catch (ex2) {}
						process.exit(1);
					}
				}
				tiJS.push('"' + moduleName + '":"' + fs.readFileSync(file).toString().trim().replace(/\\/g, '\\\\').replace(/\n/g, '\\n\\\n').replace(/"/g, '\\"') + '"');
			} else if (isCommonJS) {
				tiJS.push('"' + moduleName + '":function(){\n/* ' + file.replace(this.buildDir, '') + ' */\ndefine(function(require,exports,module){\n' + fs.readFileSync(file).toString() + '\n});\n}');
			} else {
				tiJS.push('"' + moduleName + '":function(){\n/* ' + file.replace(this.buildDir, '') + ' */\n\n' + fs.readFileSync(file).toString() + '\n}');
			}
		}, this);

		this.precacheImages.forEach(function (url) {
			url = url.replace(/\\/g, '/');

			var img = path.join(this.projectResDir, /^\//.test(url) ? '.' + url : url),
				m = img.match(/(\.[a-zA-Z]{3,4})$/),
				type = m && imageMimeTypes[m[1]];

			if (type && afs.exists(img)) {
				if (!requireCacheWritten) {
					tiJS.push('require.cache({');
					requireCacheWritten = true;
				}

				first || tiJS.push(',\n');
				first = false;
				moduleCounter++;

				tiJS.push('"url:' + url + '":"data:' + type + ';base64,' + fs.readFileSync(img).toString('base64') + '"');
			}
		}, this);

		requireCacheWritten && tiJS.push('});\n');

		// 4) write the ti.app.properties
		var props = this.tiapp.properties || {};
		this.tiapp.mobileweb.filesystem.backend && (props['ti.fs.backend'] = { type: 'string', value: this.tiapp.mobileweb.filesystem.backend });
		this.tiapp.mobileweb.map.backend && (props['ti.map.backend'] = { type: 'string', value: this.tiapp.mobileweb.map.backend });
		this.tiapp.mobileweb.map.apikey && (props['ti.map.apikey'] = { type: 'string', value: this.tiapp.mobileweb.map.apikey });

		tiJS.push('require("Ti/App/Properties", function(p) {\n');
		Object.keys(props).forEach(function (name) {
			var prop = props[name],
				type = prop.type || 'string';
			tiJS.push('\tp.set' + type.charAt(0).toUpperCase() + type.substring(1).toLowerCase() + '("'
				+ name.replace(/"/g, '\\"') + '",' + (type == 'string' ? '"' + prop.value.replace(/"/g, '\\"') + '"': prop.value) + ');\n');
		});
		tiJS.push('});\n');

		// 5) write require() to load all Ti modules
		this.modulesToLoad.sort();
		this.modulesToLoad = this.modulesToLoad.concat(this.tiModulesToLoad);
		tiJS.push('require(' + JSON.stringify(this.modulesToLoad) + ');\n');

		fs.writeFileSync(this.buildDir + '/titanium.js', tiJS.join(''));

		callback();
	},

	minifyJavaScript: function () {
		if (this.minifyJS) {
			this.logger.info(__('Minifying JavaScript'));
			var self = this;
			(function walk(dir) {
				fs.readdirSync(dir).sort().forEach(function (dest) {
					var stat = fs.statSync(dir + '/' + dest);
					if (stat.isDirectory()) {
						walk(dir + '/' + dest);
					} else if (jsExtRegExp.test(dest)) {
						dest = dir + '/' + dest;
						var source = dest + '.uncompressed.js';
						fs.renameSync(dest, source);
						self.logger.debug(__('Minifying include %s', dest));
						try {
							fs.writeFileSync(dest, UglifyJS.minify(source).code);
						} catch (ex) {
							self.logger.error(__('Failed to minify %s', dest));
							if (ex.line) {
								self.logger.error(__('%s [line %s, column %s]', ex.message, ex.line, ex.col));
							} else {
								self.logger.error(__('%s', ex.message));
							}
							try {
								var contents = fs.readFileSync(source).toString().split('\n');
								if (ex.line && ex.line <= contents.length) {
									self.logger.error('');
									self.logger.error('    ' + contents[ex.line-1]);
									if (ex.col) {
										var i = 0,
											len = ex.col;
											buffer = '    ';
										for (; i < len; i++) {
											buffer += '-';
										}
										self.logger.error(buffer + '^');
									}
									self.logger.log();
								}
							} catch (ex2) {}
							process.exit(1);
						}
					}
				});
			}(this.buildDir));
		}
	},

	assembleTitaniumCSS: function (callback) {
		var tiCSS = [
			HEADER, '\n'
		];

		if (this.tiapp.mobileweb.splash.enabled) {
			var splashDir = this.projectResDir + '/mobileweb/splash',
				splashHtmlFile = splashDir + '/splash.html',
				splashCssFile = splashDir + '/splash.css';
			if (afs.exists(splashDir)) {
				this.logger.info(__('Processing splash screen'));
				afs.exists(splashHtmlFile) && (this.splashHtml = fs.readFileSync(splashHtmlFile));
				if (afs.exists(splashCssFile)) {
					var css = fs.readFileSync(splashCssFile).toString();
					if (this.tiapp.mobileweb.splash['inline-css-images']) {
						var parts = css.split('url('),
							i = 1, p, img, imgPath, imgType,
							len = parts.length;
						for (; i < len; i++) {
							p = parts[i].indexOf(')');
							if (p != -1) {
								img = parts[i].substring(0, p).replace(/["']/g, '').trim();
								if (!/^data\:/.test(img)) {
									imgPath = img.charAt(0) == '/' ? this.projectResDir + img : splashDir + '/' + img;
									imgType = imageMimeTypes[imgPath.match(/(\.[a-zA-Z]{3})$/)[1]];
									if (afs.exists(imgPath) && imgType) {
										parts[i] = 'data:' + imgType + ';base64,' + fs.readFileSync(imgPath).toString('base64') + parts[i].substring(p);
									}
								}
							}
						}
						css = parts.join('url(');
					}
					tiCSS.push(css);
				}
			}
		}

		this.logger.info(__('Assembling titanium.css'));

		var commonCss = this.mobilewebThemeDir + '/common.css';
		afs.exists(commonCss) && tiCSS.push(fs.readFileSync(commonCss).toString());

		// TODO: need to rewrite absolute paths for urls

		// TODO: code below does NOT inline imports, nor remove them... do NOT use imports until themes are fleshed out

		var themePath = this.projectResDir + '/themes/' + this.theme;
		afs.exists(themePath) || (themePath = this.projectResDir + '/' + this.theme);
		afs.exists(themePath) || (themePath = this.mobilewebSdkPath + '/themes/' + this.theme);
		if (!afs.exists(themePath)) {
			this.logger.error(__('Unable to locate theme "%s"', this.theme) + '\n');
			process.exit(1);
		}

		wrench.readdirSyncRecursive(themePath).forEach(function (file) {
			/\.css$/.test(file) && tiCSS.push(fs.readFileSync(themePath + '/' + file).toString() + '\n');
		});

		// detect any fonts and add font face rules to the css file
		var fonts = {};
		//TODO Don't search directories for other platforms
		wrench.readdirSyncRecursive(this.projectResDir).forEach(function (file) {
			if (file.indexOf("android") == -1 &&
				file.indexOf("iphone") == -1 &&
				file.indexOf("tizen") == -1 &&
				file.indexOf("blackberry") == -1 &&
				file.indexOf("windows") == -1 //TODO Check that this will be the path for Windows
				)
			{
				var match = file.match(/^(.+)\.(otf|woff|ttf|svg)$/);
				var DS = file.indexOf("\\") != -1 ? "\\" : "/";
				var name = match && match[1].split(DS).pop();
				file = file.split("mobileweb").join("").split(DS).join("/");
				if (name) {
					fonts[name] || (fonts[name] = []);
					fonts[name].push(file);
				}
			}
		});
		Object.keys(fonts).forEach(function (name) {
			var fontFace = '@font-face{font-family:"' + name + '";src:';
			for (i = 0; i < fonts[name].length; i++) {
				fontFace += "url(\"" + fonts[name][i] + "\")" ;
				fontFace += getFormat(fonts[name][i]);
				HTML_HEADER += "\n<link rel='prefetch' href='" + fonts[name][i] + "' />"; //Important for webkit
				if (i + 1 < fonts[name].length) {
					fontFace += ",\n";
				}
			}
			fontFace += "}";
			this.logger.info("Adding Font " + fontFace);
			tiCSS.push(fontFace);
		}, this);

		function getFormat(path) {
			var parts = path.split(".");
			var ext = parts[parts.length-1];
			switch (ext) {
				case "ttf" : return " format('truetype')"; break;
				default  : return " format('" + ext + "')";
			}
		}

		// write the titanium.css
		fs.writeFileSync(this.buildDir + '/titanium.css', this.deployType == 'production' ? cleanCSS.process(tiCSS.join('')) : tiCSS.join(''));
		callback();
	},

	createIcons: function (callback) {
		this.logger.info(__('Creating favicon and Apple touch icons'));

		var file = path.join(this.projectResDir, this.tiapp.icon);
		if (!/\.(png|jpg|gif)$/.test(file) || !afs.exists(file)) {
			file = path.join(this.projectResDir, 'mobileweb', 'appicon.png');
		}

		if (afs.exists(file)) {
			afs.copyFileSync(file, this.buildDir, { logger: this.logger.debug });

			var params = [
				{ file: this.buildDir + '/favicon.ico', width: 16, height: 16 },
				{ file: this.buildDir + '/apple-touch-icon-precomposed.png', width: 57, height: 57 },
				{ file: this.buildDir + '/apple-touch-icon-57x57-precomposed.png', width: 57, height: 57 },
				{ file: this.buildDir + '/apple-touch-icon-72x72-precomposed.png', width: 72, height: 72 },
				{ file: this.buildDir + '/apple-touch-icon-114x114-precomposed.png', width: 114, height: 114 },
				{ file: this.buildDir + '/appicon144.png', width: 144, height: 144 }
			];

			appc.image.resize(file, params, function (err, stdout, stderr) {
				if (err) {
					this.logger.error(__('Failed to create icons'));
					stdout && stdout.toString().split('\n').forEach(function (line) {
						line && this.logger.error(line.replace(/^\[ERROR\]/i, '').trim());
					}, this);
					stderr && stderr.toString().split('\n').forEach(function (line) {
						line && this.logger.error(line.replace(/^\[ERROR\]/i, '').trim());
					}, this);
					this.logger.log('');
					process.exit(1);
				}
				callback();
			}.bind(this), this.logger);
		} else {
			callback();
		}
	},

	createFilesystemRegistry: function () {
		this.logger.info(__('Creating the filesystem registry'));
		var registry = 'ts\t' + fs.statSync(this.buildDir).ctime.getTime() + '\n' +
			(function walk(dir, depth) {
				var s = '';
				depth = depth | 0;
				fs.readdirSync(dir).sort().forEach(function (file) {
					// TODO: screen out specific file/folder patterns (i.e. uncompressed js files)
					var stat = fs.statSync(dir + '/' + file);
					if (stat.isDirectory()) {
						s += (depth ? (new Array(depth + 1)).join('\t') : '') + file + '\n' + walk(dir + '/' + file, depth + 1);
					} else {
						s += (depth ? (new Array(depth + 1)).join('\t') : '') + file + '\t' + stat.size + '\n';
					}
				});
				return s;
			}(this.buildDir)).trim();

		fs.writeFileSync(this.buildDir + '/titanium/filesystem.registry', registry);

		if (this.tiapp.mobileweb.filesystem.registry == 'preload') {
			fs.appendFileSync(this.buildDir + '/titanium.js', 'require.cache({"url:/titanium/filesystem.registry":"' + registry.replace(/\n/g, '|') + '"});');
		}
	},

	createIndexHtml: function () {
		this.logger.info(__('Creating the index.html'));

		// get status bar style
		var statusBarStyle = 'default';
		if (this.tiapp['statusbar-style']) {
			statusBarStyle = this.tiapp['statusbar-style'];
			if (/^opaque_black|opaque$/.test(statusBarStyle)) {
				statusBarStyle = 'black';
			} else if (/^translucent_black|transparent|translucent$/.test(statusBarStyle)) {
				statusBarStyle = 'black-translucent';
			} else {
				statusBarStyle = 'default';
			}
		}

		// write the index.html
		fs.writeFileSync(this.buildDir + '/index.html', renderTemplate(fs.readFileSync(this.mobilewebSdkPath + '/src/index.html').toString().trim(), {
			ti_header: HTML_HEADER,
			project_name: this.tiapp.name || '',
			app_description: this.tiapp.description || '',
			app_publisher: this.tiapp.publisher || '',
			ti_generator: 'Appcelerator Titanium Mobile ' + ti.manifest.version,
			ti_statusbar_style: statusBarStyle,
			ti_css: fs.readFileSync(this.buildDir + '/titanium.css').toString(),
			splash_screen: this.splashHtml,
			ti_js: fs.readFileSync(this.buildDir + '/titanium.js').toString()
		}));
	},

	collapsePath: function (p) {
		var result = [], segment, lastSegment;
		p = p.replace(/\\/g, '/').split('/');
		while (p.length) {
			segment = p.shift();
			if (segment == '..' && result.length && lastSegment != '..') {
				result.pop();
				lastSegment = result[result.length - 1];
			} else if (segment != '.') {
				result.push(lastSegment = segment);
			}
		}
		return result.join('/');
	},

	resolveModuleId: function (mid, ref) {
		var parts = mid.split('!');
		mid = parts[parts.length-1];

		if (/^url\:/.test(mid)) {
			mid = mid.substring(4);
			if (/^\//.test(mid)) {
				mid = '.' + mid;
			}
			parts = mid.split('/');
			for (var i = 0, l = this.packages.length; i < l; i++) {
				if (this.packages[i].name == parts[0]) {
					return [this.collapsePath(this.buildDir + '/' + this.packages[i].location), mid];
				}
			}
			return [this.buildDir, mid];
		}

		if (mid.indexOf(':') != -1) return [];
		if (/^\//.test(mid) || (parts.length == 1 && jsExtRegExp.test(mid))) return [this.buildDir, mid];
		/^\./.test(mid) && ref && (mid = this.collapsePath(ref + mid));
		parts = mid.split('/');

		for (var i = 0, l = this.packages.length; i < l; i++) {
			if (this.packages[i].name == parts[0]) {
				this.packages[i].name != 'Ti' && (mid = mid.replace(this.packages[i].name + '/', ''));
				return [this.collapsePath(this.buildDir + '/' + this.packages[i].location), mid];
			}
		}

		return [this.buildDir, mid];
	},

	parseModule: function (mid, ref) {
		if (this.requireCache[mid] || mid == 'require') {
			return;
		}

		var parts = mid.split('!');

		if (parts.length == 1) {
			if (mid.charAt(0) == '.' && ref) {
				mid = this.collapsePath(ref + mid);
			}
			this.requireCache[mid] = 1;
		}

		var dep = this.resolveModuleId(mid, ref);
		if (!dep.length) {
			return;
		}

		parts.length > 1 && (this.requireCache['url:' + parts[1]] = 1);

		var deps = this.dependenciesMap[parts.length > 1 ? mid : dep[1]];
		for (var i = 0, l = deps.length; i < l; i++) {
			dep = deps[i];
			ref = mid.split('/');
			ref.pop();
			ref = ref.join('/') + '/';
			this.parseModule(dep, ref);
		}
		this.moduleMap[mid] = deps;
	}

};

function badInstall(msg) {
	logger.error(msg + '\n');
	logger.log(__("Your SDK installation may be corrupt. You can reinstall it by running '%s'.", (cli.argv.$ + ' sdk update --force --default').cyan) + '\n');
	process.exit(1);
}

function applyDefaults(dest, src) {
	Object.keys(src).forEach(function (key) {
		if (dest.hasOwnProperty(key)) {
			if (Object.prototype.toString.call(dest[key]) == '[object Object]') {
				applyDefaults(dest[key], src[key]);
			}
		} else {
			if (Object.prototype.toString.call(src[key]) == '[object Object]') {
				dest[key] = {};
				applyDefaults(dest[key], src[key]);
			} else {
				dest[key] = src[key];
			}
		}
	});
}

function renderTemplate(template, props) {
	return template.replace(/\$\{([^\:\}]+)(?:\:([^\s\:\}]+))?\}/g, function (match, key, format) {
		var parts = key.trim().split('|').map(function (s) { return s.trim(); });
		key = parts[0];
		var value = '' + (props.hasOwnProperty(key) ? props[key] : 'null');
		if (parts.length > 1) {
			parts[1].split(',').forEach(function (cmd) {
				if (cmd == 'h') {
					value = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
				} else if (cmd == 'trim') {
					value = value.trim();
				} else if (cmd == 'jsQuoteEscapeFilter') {
					value = value.replace(/"/g, '\\"').replace(/\n/g, '\\n');
				}
			});
		}
		return value;
	});
}