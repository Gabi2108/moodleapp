// (C) Copyright 2015 Martin Dougiamas
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

angular.module('mm.core.course')

.constant('mmCoreCourseModulesStore', 'course_modules')

.config(function($mmSitesFactoryProvider, mmCoreCourseModulesStore) {
    var stores = [
        {
            name: mmCoreCourseModulesStore,
            keyPath: 'id'
        }
    ];
    $mmSitesFactoryProvider.registerStores(stores);
})

/**
 * Factory containing course related methods.
 *
 * @module mm.core.course
 * @ngdoc service
 * @name $mmCourse
 */
.factory('$mmCourse', function($mmSite, $mmSitesManager, $translate, $q, $log, $mmFilepool, mmCoreCourseModulesStore) {

    $log = $log.getInstance('$mmCourse');

    var self = {},
        mods = ["assign", "assignment", "book", "chat", "choice", "data", "database", "date", "external-tool",
            "feedback", "file", "folder", "forum", "glossary", "ims", "imscp", "label", "lesson", "lti", "page", "quiz",
            "resource", "scorm", "survey", "url", "wiki", "workshop"
        ];

    /**
     * Get a module from Moodle.
     *
     * @module mm.core.course
     * @ngdoc method
     * @name $mmCourse#getModule
     * @param {Number} courseid    The course ID.
     * @param {Number} moduleid    The module ID.
     * @param {Number} [sectionid] The section ID.
     * @return {Promise}
     */
    self.getModule = function(courseid, moduleid, sectionid) {

        if (!moduleid) {
            return $q.reject();
        }

        $log.debug('Getting module ' + moduleid + ' in course ' + courseid + ' and section ' +sectionid);

        var params = {
                courseid: courseid,
                options: [
                    {
                        name: 'cmid',
                        value: moduleid
                    }
                ]
            },
            preSets = {
                cacheKey: getModuleCacheKey(moduleid)
            };

        if (sectionid) {
            params.options.push({
                name: 'sectionid',
                value: sectionid
            });
        }

        return $mmSite.read('core_course_get_contents', params, preSets).then(function(sections) {
            var section,
                module;

            for (var i = 0; i < sections.length; i++) {
                section = sections[i];
                for (var j = 0; j < section.modules.length; j++) {
                    module = section.modules[i];
                    if (module.id === moduleid) {
                        return module;
                    }
                }
            }

            return $q.reject();
        });
    };

    /**
     * Get cache key for module WS calls.
     *
     * @param {Number} moduleid Module ID.
     * @return {String}         Cache key.
     */
    function getModuleCacheKey(moduleid) {
        return 'mmCourse:module:' + moduleid;
    }

    /**
     * Returns the source to a module icon.
     *
     * @module mm.core.course
     * @ngdoc method
     * @name $mmCourse#getModuleIconSrc
     * @param {String} moduleName The module name.
     * @return {String} The IMG src.
     */
    self.getModuleIconSrc = function(moduleName) {
        if (mods.indexOf(moduleName) < 0) {
            moduleName = "external-tool";
        }

        return "img/mod/" + moduleName + ".svg";
    };

    /**
     * Get a module status.
     *
     * @module mm.core.course
     * @ngdoc method
     * @name $mmCourse#getModuleStatus
     * @param {String} siteId           Site ID.
     * @param {Number} id               Module ID.
     * @param {Number} [revision=0]     Module's revision.
     * @param {Number} [timemodified=0] Module's timemodified.
     * @return {Promise}                Promise resolved with the status.
     */
    self.getModuleStatus = function(siteId, id, revision, timemodified) {
        revision = revision || 0;
        timemodified = timemodified || 0;
        return $mmSitesManager.getSite(siteId).then(function(site) {
            var db = site.getDb();
            return db.get(mmCoreCourseModulesStore, id).then(function(module) {
                if (module.status === $mmFilepool.FILEDOWNLOADED) {
                    if (revision > module.revision || timemodified > module.timemodified) {
                        // File is outdated. Let's change its status.
                        module.status = $mmFilepool.FILEOUTDATED;
                        db.insert(mmCoreCourseModulesStore, module);
                    }
                }
                return module.status;
            }, function() {
                return $mmFilepool.FILENOTDOWNLOADED;
            });
        });
    };

    /**
     * Get module revision number from contents.
     *
     * @module mm.core.course
     * @ngdoc method
     * @name $mmCourse#getRevisionFromContents
     * @param {Object[]} contents Module contents.
     * @return {Number}           Module revision.
     */
    self.getRevisionFromContents = function(contents) {
        if (contents && contents.length) {
            for (var i = 0; i < contents.length; i++) {
                var file = contents[i];
                if (file.fileurl) {
                    var revision = $mmFilepool.getRevisionFromUrl(file.fileurl);
                    if (typeof revision !== 'undefined') {
                        return revision;
                    }
                }
            }
        }
        return 0;
    };

    /**
     * Return a specific section.
     *
     * @module mm.core.course
     * @ngdoc method
     * @name $mmCourse#getSection
     * @param {Number} courseid The course ID.
     * @param {Number} sectionid The section ID.
     * @param {Boolean} refresh True when we should not get the value from the cache.
     * @return {Promise} The reject contains the error message, else contains the section.
     */
    self.getSection = function(courseid, sectionid, refresh) {
        var deferred = $q.defer();

        if (sectionid < 0) {
            deferred.reject('Invalid section ID');
            return deferred.promise;
        }

        self.getSections(courseid, refresh).then(function(sections) {
            for (var i = 0; i < sections.length; i++) {
                if (sections[i].id == sectionid) {
                    deferred.resolve(sections[i]);
                    return;
                }
            }
            deferred.reject('Unkown section');
        }, function(error) {
            deferred.reject(error);
        });

        return deferred.promise;
    };

    /**
     * Get the course sections.
     *
     * @module mm.core.course
     * @ngdoc method
     * @name $mmCourse#getSections
     * @param {Number} courseid The course ID.
     * @param {Boolean} refresh True when we should not get the value from the cache.
     * @return {Promise} The reject contains the error message, else contains the sections.
     */
    self.getSections = function(courseid, refresh) {
        var presets = {};
        if (refresh) {
            presets.getFromCache = false;
        }
        return $mmSite.read('core_course_get_contents', {
            courseid: courseid,
            options: []
        }, presets);
    };

    /**
     * Get module timemodified from contents.
     *
     * @module mm.core.course
     * @ngdoc method
     * @name $mmCourse#getTimemodifiedFromContents
     * @param {Object[]} contents Module contents.
     * @return {Number}           Module timemodified.
     */
    self.getTimemodifiedFromContents = function(contents) {
        if (contents && contents.length) {
            for (var i = 0; i < contents.length; i++) {
                var file = contents[i];
                if (file.timemodified) {
                    return file.timemodified;
                }
            }
        }
        return 0;
    };

    /**
     * Invalidates module WS call.
     *
     * @module mm.core.course
     * @ngdoc method
     * @name $mmCourse#invalidateModule
     * @param {Number} moduleid Module ID.
     * @return {Promise}        Promise resolved when the data is invalidated.
     */
    self.invalidateModule = function(moduleid) {
        return $mmSite.invalidateWsCacheForKey(getModuleCacheKey(moduleid));
    };

    /**
     * Check if a module is outdated.
     *
     * @module mm.core.course
     * @ngdoc method
     * @name $mmCourse#isModuleOutdated
     * @param {String} siteId           Site ID.
     * @param {Number} id               Module ID.
     * @param {Number} [revision=0]     Module's revision.
     * @param {Number} [timemodified=0] Module's timemodified.
     * @return {Promise}                Promise resolved with boolean: true if module is outdated, false otherwise.
     */
    self.isModuleOutdated = function(siteId, id, revision, timemodified) {
        revision = revision || 0;
        timemodified = timemodified || 0;
        return $mmSitesManager.getSite(siteId).then(function(site) {
            var db = site.getDb();
            return db.get(mmCoreCourseModulesStore, id).then(function(module) {
                return revision > module.revision || timemodified > module.timemodified;
            }, function() {
                return false;
            });
        });
    };

    /**
     * Store module status.
     *
     * @module mm.core.course
     * @ngdoc method
     * @name $mmCourse#storeModuleStatus
     * @param {String} siteId           Site ID.
     * @param {Number} id               Module ID.
     * @param {String} status           New module status.
     * @param {Number} [revision=0]     Module's revision.
     * @param {Number} [timemodified=0] Module's timemodified.
     * @return {Promise}                Promise resolved when status is stored.
     */
    self.storeModuleStatus = function(siteId, id, status, revision, timemodified) {
        $log.debug('Set status \'' + status + '\' for module ' + id);
        revision = revision || 0;
        timemodified = timemodified || 0;
        return $mmSitesManager.getSite(siteId).then(function(site) {
            var db = site.getDb();
            return db.insert(mmCoreCourseModulesStore, {
                id: id,
                status: status,
                revision: revision,
                timemodified: timemodified,
                updated: new Date().getTime()
            });
        });
    };

    /**
     * Translate a module name to current language.
     *
     * @module mm.core.course
     * @ngdoc method
     * @name $mmCourse#translateModuleName
     * @param {String} moduleName The module name.
     * @return {Promise}          Promise resolved with the translated name.
     */
    self.translateModuleName = function(moduleName) {
        if (mods.indexOf(moduleName) < 0) {
            moduleName = "external-tool";
        }

        var langkey = 'mm.core.mod_'+moduleName;
        return $translate(langkey).then(function(translated) {
            return translated !== langkey ? translated : moduleName;
        });
    };


    return self;
});
