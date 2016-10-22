'use strict';

const Promise = require('bluebird');
const vDOM = require('jsdom');
const Xray = require('x-ray');
const getCoords = require('./getCoords').getCoords
const x = Xray();

// constants
const STARGAZER_USER_URL_DOM_PATH = 'ol.follow-list li div h3 span a';
const STARGAZER_PAGINATION_DOM_PATH = '.pagination a';
const NEXT_PAGE_LINK_TEXT = 'Next';
const CHUNK_SIZE = 50;

// Mock data
var USERNAME = 'isRuslan';
var PACKAGE_NAME = 'awesome-elm';
var pg = 1;
var totalStargazers = 0;

// Start
startStargazing(USERNAME, PACKAGE_NAME);
////////

var start = new Date().getTime();

function getPromiseCall (url) {
  return Promise.promisify(x(url, 'body@html'))().then(function (data) {
    return resolveStargazers(data);
  });
}

// Starting point
function startStargazing (username, repository, page) {
  page = page ? page : 1;
  x('https://github.com/'+username+'/'+repository+'/stargazers?page='+page, 'body@html')
  (function(err, data) {
    if (err) throw new Error(err);
    return resolveStargazers(data);
  });
}

const resolveStargazers = (data) => {
  if (!data) if (err) throw new Error('data came back null in `resolveStargazers`');
  console.log('Loading stargazers (pg '+(pg++)+')...');
  vDOM.env(
    data,
    function (err, window) {
      if (err) throw new Error(err);
      if (window.document.querySelector('.container p').innerHTML.indexOf('abuse detection mechanism') > -1) {
        console.log('Blocked by GitHub');
        setTimeout(() => {
          startStargazing('nickzuber', 'needle', --pg)
        }, 5000);
        return;
      }

      var stargazers = [];
      var stargazersCount = window.document.querySelectorAll(STARGAZER_USER_URL_DOM_PATH).length;
      for (let i = 0; i < stargazersCount; i++) {
        stargazers.push(window.document.querySelectorAll(STARGAZER_USER_URL_DOM_PATH)[i].href);
      }
      var pageLinks = window.document.querySelectorAll(STARGAZER_PAGINATION_DOM_PATH).length;
      var nextPageURL = null;
      for (let i = 0; i < pageLinks; i++) {
        if (window.document.querySelectorAll(STARGAZER_PAGINATION_DOM_PATH)[i].innerHTML === NEXT_PAGE_LINK_TEXT) {
          nextPageURL = window.document.querySelectorAll(STARGAZER_PAGINATION_DOM_PATH)[i].href;
          break;
        }
      }
      totalStargazers += stargazers.length;
      if (stargazers.length > 0) {
        findAllLocations(stargazers, nextPageURL);
      }
    }
  );
}

/**
 * Partition users into chunks for incredmental loading of their locations,
 * instead of trying to load them all at once which will take a long time to
 * get any data back.
 * @param  {Array.string} stargazers Array of stargazing user urls.
 * @return {void}
 */
function incrementallyLoadUserData (stargazers) {
  var chunks = [];
  while (stargazers.length > CHUNK_SIZE) {
    chunks.push(stargazers.splice(0, CHUNK_SIZE));
  }
  if (stargazers.length > 0) {
    chunks.push(stargazers);
  }
  var promiseChunks = [];
  chunks.forEach((userUrls) => {
    promiseChunks.push(function (listOfChunks) {
      findAllLocations(userUrls, listOfChunks);
    });
  });
  console.log('Resolved '+promiseChunks.length+' chunks');

  var currentChunk = promiseChunks.shift();
  currentChunk(promiseChunks);
}

/**
 * Given an array of github user urls and the next page of stargazers, we
 * find all the locations of the github user list and when we're all done, we
 * check to see if we have any more pages of stargazers to resolve.
 * @param  {Array.string} userUrls     The list of github account urls.
 * @param  {string}       nextPageURL  The url of the next stargazers page.
 * @return {void}
 */
function findAllLocations (userUrls, nextPageURL) {
  console.log('Resolving '+userUrls.length+' locations...');
  var promiseUsers = [];
  userUrls.forEach(function (url) {
    promiseUsers.push(
      Promise.promisify(x(url, 'li[itemprop="homeLocation"]'))().then(function(data) {
        return data || null;
      })
    );
  });
  Promise.all(promiseUsers).then(function(data) {
    var filteredData = data.filter(function (location) {
      if (location){
        getCoords(location, function(err, res) {
          if (err || !res || typeof res === 'undefined') return (0, 0);
          if (typeof res[0] === 'undefined') return (0, 0);
          return (res[0].latitude, res[0].longitude);
        });
      }
    });
    console.log('...done resolving chunk!');
  }).finally(function () {
    if (nextPageURL) {
      getPromiseCall(nextPageURL);
    } else {
      console.log('...done all chunking');
      var end = new Date().getTime();
      var time = end - start;
      console.log('Entire process took ~'+(time/1000)+'s and we found '+totalStargazers+' stargazers');
    }
  });
}
