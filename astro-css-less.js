'use strict';

var nodeFS = require('fs');
var nodePath = require('path');
var lessParser = require('less');
var util = require('lang-utils');

var reg_import = /@import *[\"\']([a-z,A-z,\\,\/,\-]+)[\"\'];?/gi;

module.exports = new astro.Middleware({
    fileType: ['css'],
    modType: ['page']
}, function(asset, next) {
    let project = asset.project;
    let prjCfg = astro.getProject(project);
    // 分析JS模块的依赖

    let webComCode = '';
    let components = [];
    if (asset.components && asset.components.length) {
        components = asset.components.map(function(wc) {
            return new astro.Asset({
                ancestor: asset,
                project: project,
                modType: 'webCom',
                name: wc,
                fileType: 'css'
            })
        });
    }

    let jsLibs;
    if (asset.jsLibs && asset.jsLibs.length) {
        jsLibs = (asset.jsLibs[1]||[]).map(function(wc) {
            return new astro.Asset({
                ancestor: asset,
                project: project,
                modType: 'jsCom',
                name: wc,
                fileType: 'css'
            })
        });
    }
    var errorTxt = '';
    astro.Asset.getContents(jsLibs, function(assets){
        assets.forEach(function(ast) {
            if (ast.data) {
                webComCode += '/* css-less -> ' + ast.filePath + ' */\n' + ast.data + '\n';
            } else {
                errorTxt += '/* css-less -> '+ ast.info +'\n\t' + ast.filePath + '  is miss or empty\n */\n'
            }
        });

        astro.Asset.getContents(components, function(assets){

            assets.forEach(function(ast) {
                if (ast.data) {
                    webComCode += '/* css-less -> ' + ast.filePath + ' */\n' + ast.data + '\n';
                } else {
                    errorTxt += '/* css-less -> ' + ast.info +' '+ ast.filePath + '  is miss or empty */\n'
                }
            });
            // Web模块 + 页面 LESS
            asset.data = webComCode + (asset.data||'');

            // 处理引用
            processImport(asset, null, null, function(error) {
                asset.less = asset.data;
                lessParser.render(asset.data, {
                    compress: prjCfg.compressCss
                }, function(err, output) {
                    if (err) {
                        var line = 1;
                        asset.data = errorTxt + error + '\n/* css-less -> ' + JSON.stringify(err) +
                            ' */\n\n input is :\n' +
                            asset.data.replace(/(.*)\n?/ig, function(a, b, c) {
                                return line++ + '  ' + b + '\n';
                            });
                    } else {
                        asset.data = errorTxt + error + output.css;
                    }
                    next(asset);
                });
            });

        });
    })
});

// 处理文件中的Import
function processImport(asset, imported, errorCode, callback) {
    imported = imported || {};
    errorCode = errorCode || '';

    let project = asset.project,
        cfg = astro.getProject(project),
        lessCode = asset.data;

    var imports = [];
    lessCode = lessCode.replace(reg_import, function(importstr, path) {
        if (imported[path]) {
            return '/* css-less -> file:' + path + ' has been imported */\n'
        }
        imported[path] = true;
        imports.push(new astro.Asset({
            ancestor: asset,
            project: project,
            modType: 'cssLib',
            name: path,
            fileType: 'css'
        }));
        return '/* css-less -> ' + path + ' imported first */';
    });
    var importsCode = '';

    astro.Asset.getContents(imports).then(function() {
        imports.forEach(function(asset) {
            if (asset.data) {
                importsCode += '/* css-less -> ' + asset.name + ' */\n' + asset.data + '\n';
            } else {
                errorCode += '/* css-less -> file:' + asset.info +' '+ asset.name + ' is miss or empty */\n'
            }
        });

        lessCode = importsCode + lessCode;
        asset.data = lessCode;
        if (reg_import.test(lessCode)) {
            processImport(asset, imported, errorCode, callback);
            return;
        }
        callback(errorCode);
    });
};