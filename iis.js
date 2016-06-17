/**
 *  Copyright (C) 2012 Integrify, Inc.
 *
 */


var exec = require('child_process').exec;
var path = require('path');
var os = require("os");
var xml2js = require('xml2js');
var _ = require('underscore');

const defaultBindingInfo = {
                site : null,
                bindingInfo: null,
                protocol:'http',
                host: '*',
                ip: '*',
                port: '80'
            };

var IIS = function() {
    return {
        setDefaults : function() {
            if (os.arch() === "x64") {
                this.appcmd = process.env["windir"] + "\\syswow64\\inetsrv\\appcmd.exe";
            } else {
                this.appcmd = process.env["windir"] + "\\system32\\inetsrv\\appcmd.exe";
            }
        },
        createSite : function(options,cb) {
            var self = this;
            options = options ||
            {
                name : 'New Site',
                protocol:'http',
                host: '*',
                port: '80',
                ip: '*'
            };

            //hold this to be used when creating app folders, etc
            self.last_site = options.name;

            self.exists('site',options.name,function(err,tf) {
                if (!tf) {

                    var site_cmd = ' add site /name:"' + options.name + '"';
                    site_cmd += ' /bindings:' + (options.bindings ||
                            (options.protocol === 'https'
                            ? options.protocol + '/' + options.ip + ':' + options.port + ':' + options.host
                            : options.protocol + '://' + options.host + ':' + options.port)
                        );

                    if (options.path) {
                        site_cmd += ' /physicalPath:"' + options.path + '"';
                    }

                    exec(self.appcmd + ' ' + site_cmd,cb);
                }
                else {
                    cb(err,'Site ' + options.name + ' exists');
                }
            });

        },
        deleteSite : function(name,cb) {
            exec(this.appcmd + ' delete site /site.name:"' + name + '"',cb);
        },
        stopSite : function(name,cb) {
            exec(this.appcmd + ' stop site /site.name:"' + name + '"',cb);
        },
        startSite : function(name,cb) {
            exec(this.appcmd + ' start site /site.name:"' + name + '"',cb);
        },
        /**
        /**
         * Create app pool, also set app pool identity of object {name:,identity:} passed
         * @param options
         * @param cb
         */
        createAppPool : function(options,cb) {
            var self = this;
            var poolname = typeof(options) == 'string' ? options : options.name;
            var identity = typeof(options) == 'string' ? null : options.identity;
            self.exists('apppool',poolname,function(err,tf) {
                if (!tf) {
                    exec(self.appcmd + ' add apppool /name:"' + poolname + '"',function(err,stdout) {
                        if (!err && identity) {
                            self.setAppPoolIdentity(poolname,identity,cb);
                        }
                        else {
                            cb(err,stdout);
                        }
                    });
                }
                else {
                    cb(null,'App pool ' + poolname + ' exists');
                }
            })
        },
        recycleAppPool : function(name,cb) {
            exec(this.appcmd + ' recycle apppool /apppool.name:"' + name + '"',cb);
        },
        deleteAppPool : function(name,cb) {
            exec(this.appcmd + ' delete apppool /apppool.name:"' + name + '"',cb);
        },
        stopAppPool : function(name,cb) {
            exec(this.appcmd + ' stop apppool /apppool.name:"' + name + '"',cb);
        },
        mapAppPool : function(app_name,pool_name,cb) {
            var map_cmd = ' set app /app.name:"' + app_name + '" /applicationPool:' + pool_name;
            exec(this.appcmd + ' ' + map_cmd,cb);
        },
        buildBindingInfo : function(protocol, ip, host, port) {
            return 'protocol=\'' + protocol + '\',bindingInformation=\'' + ip + ':' + port + ':' + host + '\'';
        },
        siteBindingExists : function(siteName, binding, cb) {
            var self = this;

            binding = Object.assign({}, defaultBindingInfo, binding);
            siteName = siteName || self.last_site;

            self.list('site',function(err,res) {

                var match = null;

                if (!err) {
                    match = _.find(res,function(v) {
                        var activeSiteName = v['SITE.NAME'];

                        if (!activeSiteName || activeSiteName.toLowerCase() !== siteName.toLowerCase()) {
                            return false;
                        } else {
                            const bindingInfo = binding.ip + ':' + binding.port + ':' + binding.host;

                            return v.bindings.toLowerCase().includes(bindingInfo.toLowerCase());
                        }
                    });
                }

                if (cb) {
                    cb(err, !!match);
                }
                else {
                    console.log(match);
                }

            });
        },
        deleteSiteBinding : function(options, cb) {
            var self = this;
            options = Object.assign({}, defaultBindingInfo, options);

            options.site = options.site || self.last_site;

            self.exists('site',options.site,function(err,tf) {
                if (tf) {
                    var bindingInfo = options.bindingInfo || self.buildBindingInfo(options.protocol, options.ip, options.host, options.port);
                    var site_cmd = ' set site /site.name:"' + options.site + '" /-bindings.['+bindingInfo+']';

                    exec(self.appcmd + ' ' + site_cmd, cb);
                }
            });
        },
        addSiteBinding : function(options,cb) {
            var self = this;
            options = Object.assign({}, defaultBindingInfo, options);

            options.site = options.site || self.last_site;

            self.exists('site',options.site,function(err,tf) {
                if (tf) {
                    var bindingInfo = options.bindingInfo || self.buildBindingInfo(options.protocol, options.ip, options.host, options.port);
                    var site_cmd = ' set site /site.name:"' + options.site + '" /+bindings.['+bindingInfo+']';

                    exec(self.appcmd + ' ' + site_cmd,cb);
                }
            });
        },
        createApplication : function(options,cb) {
            var self = this;

            var siteName = typeof(options) == 'string' ? null : options.site;
            var applicationName = typeof(options) == 'string' ? options : options.name;
            var physicalPath = typeof(options) == 'string' ? null : options.path;

            siteName = siteName || self.last_site;

            var fullName = siteName + '/' + applicationName;

            self.exists('app', fullName, function(err,tf) {
                if (!tf) {
                    var site_cmd = ' add app /site.name:"' + siteName + '"';

                    site_cmd += ' /path:"' + applicationName + '"';

                    if (physicalPath) {
                        site_cmd += ' /physicalPath:"' + physicalPath + '"';
                    }

                    exec(self.appcmd + ' ' + site_cmd,cb);
                }
                else {
                    cb(err,'App ' + fullName + ' exists');
                }
            });
        },
        createVirtualDirectory : function(options,cb) {
            var self = this;

            options = options ||
            {
                site: null,
                application: null,
                name : 'Content',
                path: null
            };

            options.site = options.site || self.last_site;

            var fullAppName = options.site + '/' + (options.application || '');
            var fullName = fullAppName + (fullAppName.endsWith('/') ? '' : '') + options.name;

            self.exists('vdir', fullName, function(err,tf) {
                if (!tf) {
                    var site_cmd = ' add vdir /app.name:"' + fullAppName + '"';

                    site_cmd += ' /path:"' + options.name + '"';
                    site_cmd += ' /physicalPath:"' + options.path + '"';

                    exec(self.appcmd + ' ' + site_cmd,cb);
                }
                else {
                    cb(err,'VDir ' + fullName + ' exists');
                }
            });
        },
        setAppPoolIdentity : function(pool_name,identity,cb) {
            var set_cmd = " set config /section:applicationPools /[name='" + pool_name + "'].processModel.identityType:" + identity;
            exec(this.appcmd + ' ' + set_cmd,cb);
        },
        createAppFolder : function(options,cb) {
            var self = this;
            self.exists('app',(options.site || this.last_site) + '/' + options.virtual_path,function(err,tf) {
                if (!tf) {
                    var createapp_cmd = ' add app /site.name:"' + (options.site || self.last_site) + '" /path:/' + options.virtual_path + ' /physicalPath:"' + options.physical_path + '"';
                    exec(self.appcmd + createapp_cmd,cb);
                }
                else {
                    cb(err,"App " + (options.site || self.last_site) + '/' + options.virtual_path + " already exists");
                }});

        },
        unlockSection : function(section,cb) {
            var unlock_cmd = " unlock config /section:" + section;
            exec(this.appcmd + unlock_cmd,cb);

        },
        setWindowsAuthentication : function(appPath,enable,cb) {
            var self = this;
            var set_cmd = ' set config "' + appPath + '" /section:windowsAuthentication /enabled:' + enable;
            self.unlockSection('windowsAuthentication',function(err,stdout) {
                exec(self.appcmd + set_cmd,cb);
            });

        },
        setAnonymousAuthentication : function(appPath,enable,cb) {
            var self = this;
            var set_cmd = ' set config "' + appPath + '" /section:anonymousAuthentication /enabled:' + enable;
            self.unlockSection('anonymousAuthentication',function(err,stdout) {
                exec(self.appcmd + set_cmd,cb);
            });

        },
        list : function(type,cb) {
            var parser = new xml2js.Parser()
            exec(this.appcmd + ' list ' + type + ' /xml',function(err,outxml) {
                parser.parseString(outxml,function(err,result) {
                    //
                    //  may return a single object if only 1 site exists
                    //
                    var mapped = _.isArray(result[type.toUpperCase()]) ? _.map(result[type.toUpperCase()],function(v) {
                        return v['@'];
                    }) : [result[type.toUpperCase()]['@']];

                    if (cb) {
                        cb(err,mapped);
                    }
                    else {
                        console.log(mapped);

                    }

                });

            });

        },
        exists : function(type,name,cb) {
            var self = this;
            this.list(type,function(err,res) {

                var match = null;

                if (!err) {
                    match = _.find(res,function(v) {
                        var m = v[type.toUpperCase() + '.NAME'];
                        return m && m.toLowerCase() === name.toLowerCase();
                    });
                }

                if (cb) {
                    cb(err,match ? true : false);
                }
                else {
                    console.log(match);
                }

            });

        },
        setFilePermissions: function(path,account,cb) {
            exec('icacls "' + path + '*" /grant ' + account + ':(OI)(CI)F',function(err,stdout) {
                if (cb) {
                    cb(err,stdout);
                }
                else {
                    console.log(err,stdout);
                }
            });
        },
        /**
         * Set the physical path web site maps to
         * @param site_name
         */
        setPhysicalPath : function(site_name,path,cb) {
            exec(this.appcmd + ' set vdir "' +  site_name +'/" -physicalPath:"' + path + '"',cb);
        },
        /**
         * Get the physical path web site maps to
         * @param site_name
         */
        getPhysicalPath : function(site_name,cb) {
            var self = this;
            this.list("VDIR",function(err,res) {

                var match = null;

                if (!err) {
                    match = _.find(res,function(v) {
                        var m = v['VDIR.NAME'];
                        return m && m.toLowerCase() === (site_name.toLowerCase() + '/');
                    });
                }

                if (cb) {
                    cb(err,match ? match["physicalPath"] : null);
                }
                else {
                    console.log(match ? match["physicalPath"] : null);
                }
            });
        }
    };
}();

IIS.setDefaults({});

module.exports = IIS;


