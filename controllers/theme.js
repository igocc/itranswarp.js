// home.js

var
    _ = require('lodash'),
    async = require('async'),
    db = require('../db'),
    config = require('../config'),
    utils = require('./_utils'),
    constants = require('../constants');

var signins = _.map(config.oauth2, function(value, key) {
    return key;
});

var
    User = db.user,
    Article = db.article,
    Category = db.category,
    Text = db.text,
    warp = db.warp;

var
    articleApi = require('./articleApi'),
    categoryApi = require('./categoryApi'),
    wikiApi = require('./wikiApi'),
    commentApi = require('./commentApi'),
    pageApi = require('./pageApi'),
    userApi = require('./userApi'),
    navigationApi = require('./navigationApi'),
    settingApi = require('./settingApi');

function appendSettings(model, callback) {
    settingApi.getSettingsByDefaults('website', settingApi.defaultSettings.website, function(err, r) {
        if (err) {
            return callback(err);
        }
        model.__website__ = r;
        navigationApi.getNavigations(function(err, navigations) {
            if (err) {
                return callback(err);
            }
            model.__navigations__ = navigations;
            callback(null);
        });
    });
}

function processTheme(view, model, req, res, next) {
    appendSettings(model, function(err) {
        if (err) {
            return next(err);
        }
        model.__signins__ = signins;
        model.__user__ = req.user;
        model.__time__ = Date.now();
        model.__request__ = {
            host: req.host
        };
        return res.render(res.themePath + view, model);
    });
}

function createCommentByType(ref_type, checkFunction, req, res, next) {
    if (utils.isForbidden(req, constants.ROLE_SUBSCRIBER)) {
        return next(api.notAllowed('Permission denied.'));
    }
    try {
        var content = utils.getRequiredParam('content', req);
    }
    catch (e) {
        return next(e);
    }
    var ref_id = req.params.id;
    checkFunction(ref_id, function(err, entity) {
        if (err) {
            return next(err);
        }
        commentApi.createComment(ref_type, ref_id, req.user, content, function(err, comment) {
            return res.send(comment);
        });
    });
}

exports = module.exports = {

    'GET /': function(req, res, next) {
        //
    },

    'GET /category/:id': function(req, res, next) {
        var page = utils.getPage(req);
        var model = {};
        async.waterfall([
            function(callback) {
                categoryApi.getCategory(req.params.id, callback);
            },
            function(category, callback) {
                model.category = category;
                articleApi.getArticlesByCategory(page, category.id, callback);
            }
        ], function(err, r) {
            if (err) {
                return next(err);
            }
            model.articles = r.articles;
            model.page = r.page;
            return processTheme('article/category.html', model, req, res, next);
        });
    },

    'GET /article/:id': function(req, res, next) {
        var model = {};
        async.waterfall([
            function(callback) {
                articleApi.getArticle(req.params.id, callback);
            },
            function(article, callback) {
                model.article = article;
                categoryApi.getCategory(article.category_id, callback);
            },
            function(category, callback) {
                model.category = category;
                commentApi.getComments(model.article.id, callback);
            }
        ], function(err, r) {
            if (err) {
                return next(err);
            }
            model.article.html_content = utils.md2html(model.article.content);
            model.comments = r.comments;
            return processTheme('article/article.html', model, req, res, next);
        });
    },

    'POST /article/:id/comment': function(req, res, next) {
        createCommentByType('article', function(id, callback) {
            articleApi.getArticle(id, callback);
        }, req, res, next);
    },

    'POST /wiki/:id/comment': function(req, res, next) {
        createCommentByType('wiki', function(id, callback) {
            wikiApi.getWiki(id, callback);
        }, req, res, next);
    },

    'POST /wikipage/:id/comment': function(req, res, next) {
        createCommentByType('wikipage', function(id, callback) {
            wikiApi.getWikiPage(id, callback);
        }, req, res, next);
    },

    'GET /page/:alias': function(req, res, next) {
        pageApi.getPageByAlias(req.params.alias, function(err, page) {
            if (err) {
                return next(err);
            }
            page.html_content = utils.md2html(page.content);
            var model = {
                page: page
            };
            return processTheme('page/page.html', model, req, res, next);
        });
    },

    'GET /wiki/:id': function(req, res, next) {
        wikiApi.getWikiWithContent(req.params.id, function(err, wiki) {
            if (err) {
                return next(err);
            }
            wikiApi.getWikiTree(wiki.id, function(err, tree) {
                if (err) {
                    return next(err);
                }
                var model = {
                    wiki: wiki,
                    tree: tree.children,
                    html_content: utils.md2html(wiki.content)
                };
                return processTheme('wiki/wiki.html', model, req, res, next);
            })
        });
    },

    'GET /wiki/:wid/:pid': function(req, res, next) {
        wikiApi.getWikiPageWithContent(req.params.pid, function(err, page) {
            if (err) {
                return next(err);
            }
            if (page.wiki_id!==req.params.wid) {
                return next(api.resourceNotFound('Wiki'));
            }
            wikiApi.getWikiTree(page.wiki_id, function(err, wiki) {
                if (err) {
                    return next(err);
                }
                var model = {
                    wiki: wiki,
                    page: page,
                    tree: wiki.children,
                    html_content: utils.md2html(page.content)
                };
                return processTheme('wiki/wiki.html', model, req, res, next);
            });
        });
    },
};