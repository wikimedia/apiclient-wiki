// PKCE code Copyright (c) 2019 Aaron Parecki
// MIT Public License
// https://github.com/aaronpk/pkce-vanilla-js

/*global $ Handlebars */

const root = 'https://api.wikimedia.org/core/v1/wikipedia/en/'
const authorize = 'https://meta.wikimedia.org/w/rest.php/oauth2/authorize'
const token = 'https://meta.wikimedia.org/w/rest.php/oauth2/access_token'
const server = 'https://apiclient.wiki/'
const profileurl = 'https://meta.wikimedia.org/w/rest.php/oauth2/resource/profile'
const clientID = "6ac53a07b581e30e47664cd9e8f3d0e4"

const routes = [
  [new RegExp('^/$'), function() { showPage('Main Page')}],
  [new RegExp('^/index$'), function() { showPage('Main Page')}],
  [new RegExp('^/index.html$'), function() { showPage('Main Page')}],
  [new RegExp('^/page/(.*)$'), function(match) { showPage(match[1]) }],
  [new RegExp('^/callback$'), function() { endLogin() }],
  [new RegExp('^/search$'), function(match, args) { search(args) }]
]

const ajax = function(args) {
  ensureToken(function(token) {
    if (token) {
      args.headers = (args.headers) ? args.headers : {}
      args.headers['Authorization'] = `Bearer ${token}`
    }
    if (!args.error) {
      args.error = function(jqXHR, textStatus, errorThrown) {
          showError(`Error calling ${args.url}: ${errorThrown}`)
      }
    }
    $.ajax(args)
  })
}

const ensureToken = function(callback) {
  let results = getLoginResults()
  // Are we past the expiry date?
  if (Date.now() > results.access_token_expired_ms) {
    let pkce = loadPKCE()
    let data = {
      grant_type: "refresh_token",
      refresh_token: results.refresh_token,
      redirect_uri: `${server}callback`,
      client_id: clientID,
      code_verifier: pkce.codeVerifier
    }
    // We don't want to use access_token for this
    $.post({
      url: token,
      dataType: "json",
      data: data,
      success: function(newResults) {
        saveLoginResults(newResults)
        callback(newResults.access_token)
      },
      error: function(jqXHR, textStatus, errorThrown) {
        showError(`Error getting OAuth 2.0 refresh token: ${errorThrown}`)
      }
    })
  } else {
    callback(results.access_token)
  }
}

var timer = null

const showError = function(text) {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  $("#main-alert").addClass('visible').removeClass('invisible')
  $("#main-alert-text").text(text)
  timer = setTimeout(function() {
    $("#main-alert").addClass('invisible').removeClass('visible')
    $("#main-alert-text").text('')
    timer = null
  }, 10000)
}

const setContent = function(html) {
  $('#content').html(html)
}

const showLoading = function(title) {
  const template = getTemplate('loading')
  setContent(template({title: title}))
}

const showPage = function(pageTitle) {
  showLoading(pageTitle)
  let pageTitleURL = pageTitle.replace(/\\/, '%2F').replace(/\./, '%2E')
  ajax({
    method: 'GET',
    url: `${root}page/${pageTitleURL}/with_html`,
    success: function(page) {
      let elements = $.parseHTML(page.html)
      let sections = elements.filter((el) => el.tagName == "SECTION")
      let content = sections.map((el) => el.outerHTML).join("")
      let template = getTemplate('page')
      setContent(template({page: page, content: content}))
      history.pushState({title: page.title, id: page.id, key: page.key}, page.key, `${server}page/${page.key}`)
      $('a[rel="mw:WikiLink"]').click(goToTitle)
    },
    error: function(xhr, status, text) {
      showError(`error getting page ${pageTitle}: ${text}`)
    }
  })
}

const goToTitle = function(event) {
  event.preventDefault()
  let title = $(this).attr('title')
  showPage(title)
  return false
}

const noSuchRoute = function(pathname) {
  $('#page-title').text("<No such page>")
  $('#page-content').text(`No such page ${pathname}`)
}

const routeTo = function(pathname, args) {
  for (let route of routes) {
    let [re, handler] = route
    let m = pathname.match(re)
    if (m) {
      handler(m, args)
      return
    }
  }
  noSuchRoute(pathname)
}

const goHome = function(event) {
  event.preventDefault()
  routeTo('/page/Main_Page')
  return false
}

const startLogin = function() {
  let pkce = makePKCE()
  savePKCE(pkce)
  let params = {
    client_id: clientID,
    response_type: "code",
    redirect_uri: `${server}callback`,
    state: getPath(),
    code_challenge: pkce.codeChallenge,
    code_challenge_method: "S256"
  }
  let str = $.param(params)
  let url = `${authorize}?${str}`
  window.location = url
  return false
}

const endLogin = function() {
  let query = (new URL(document.location)).searchParams
  let code = query.get('code')
  let state = query.get('state')
  let pkce = loadPKCE()
  let data = {
    grant_type: "authorization_code",
    code: code,
    redirect_uri: `${server}callback`,
    client_id: clientID,
    code_verifier: pkce.codeVerifier
  }
  // We don't want to use a token for this
  $.post({
    url: token,
    dataType: "json",
    data: data,
    success: function(results) {
      saveLoginResults(results)
      getProfile(function(profile) {
        if (profile) {
          saveProfile(profile)
        }
        resetNavbar()
        routeTo(state)
      })
    },
    error: function(xhr, status, text) {
      showError(`Error finishing authorization: ${text}`)
    }
  })
}

const saveLoginResults = function(results) {
  // TODO: save other important data
  localStorage.setItem('access_token', results.access_token)
  localStorage.setItem('refresh_token', results.refresh_token)
  localStorage.setItem('access_token_expired_ms', String.toString(Date.now() + results.expires_in  * 1000))
}

const clearLoginResults = function() {
  // TODO: save other important data
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('access_token_expired_ms')
}

const getLoginResults = function() {
  return {
    access_token: localStorage.getItem('access_token'),
    refresh_token: localStorage.getItem('refresh_token'),
    access_token_expired_ms: parseFloat(localStorage.getItem('access_token_expired_ms'))
  }
}

const isLoggedIn = function() {
  return getAccessToken()
}

const getAccessToken = function() {
  return localStorage.getItem('access_token')
}

const getProfile = function(callback) {
  ajax({
    url: profileurl,
    success: callback,
    error: function() {
      // Just continue
      callback(null)
    }
  })
}

const loadProfile = function() {
  let profile = {
    username: localStorage.getItem('username')
  }
  return profile
}

const saveProfile = function(profile) {
  localStorage.setItem('username', profile.username)
}

const clearProfile = function() {
  localStorage.removeItem('username')
}

const resetNavbar = function() {
  if (isLoggedIn()) {
    let profile = loadProfile()
    $("#navbar-aboutme").text(profile.username)
    $("#navbar-aboutme").removeClass("invisible").addClass("visible")
    $("#navbar-logout").removeClass("invisible").addClass("visible")
    $("#navbar-login").removeClass("visible").addClass("invisible")
  } else {
    $("#navbar-login").removeClass("invisible").addClass("visible")
    $("#navbar-aboutme").removeClass("visible").addClass("invisible")
    $("#navbar-logout").removeClass("visible").addClass("invisible")
  }
}

const getPath = function() {
  return document.location.pathname
}

const getQuery = function() {
  return (new URL(document.location)).searchParams
}

const makePKCE = function() {
  let pkce = {
    state: generateRandomString(),
    codeVerifier: generateRandomString()
  }
  pkce.codeChallenge = pkceChallengeFromVerifier(pkce.codeVerifier)
  return pkce
}

const savePKCE = function(pkce) {
  localStorage.setItem("pkce_state", pkce.state)
  localStorage.setItem("pkce_code_verifier", pkce.codeVerifier)
}

const loadPKCE = function() {
  let pkce = {
    state: localStorage.getItem("pkce_state"),
    codeVerifier: localStorage.getItem("pkce_code_verifier")
  }
  pkce.codeChallenge = pkceChallengeFromVerifier(pkce.codeVerifier)
  return pkce
}

const clearPKCE = function() {
  localStorage.removeItem("pkce_state")
  localStorage.removeItem("pkce_code_verifier")
}

/* global Uint32Array */

const generateRandomString = function() {
  var array = new Uint32Array(28)
  window.crypto.getRandomValues(array)
  return Array.from(array, dec => ('0' + dec.toString(16)).substr(-2)).join('')
}

// Base64-urlencodes the input string
function base64urlencode(str) {
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/* global sha256 */

function pkceChallengeFromVerifier(v) {
    let hash = sha256.create()
    hash.update(v)
    let hashed = hash.array()
    let stringed = String.fromCharCode.apply(null, hashed)
    let challenge = base64urlencode(stringed)
    return challenge
}

const logout = function () {
  clearLoginResults()
  clearProfile()
  clearPKCE()
  resetNavbar()
}

const templates = {}

const getTemplate = function(id) {
  if (!(id in templates)) {
    templates[id] = compileTemplate(id)
  }
  return templates[id]
}

const compileTemplate = function(id) {
  let source = $(`#${id}`).text()
  let template = Handlebars.compile(source)
  return template
}

const search = function(args) {
  let q = args.get('q')
  if (!q) {
    showError(`No 'q' parameter for search.`)
    return
  } else {
    history.pushState({q: q}, q, `${server}search?q=${q}`)
    showLoading(`Search results for ${q}`)
    ajax({
      method: "GET",
      url: `${root}search/page`,
      data: {q: q},
      success: function(results) {
        let searchTemplate = getTemplate('search')
        let contents = searchTemplate({pages: results.pages, q: q})
        setContent(contents)
        $(".search-result-title").click(goToTitle)
      }
    })
  }
}

$(document).ready(function() {
  $(window).on('popstate', function(event) {
    if (event && event.originalEvent && event.originalEvent.state && event.originalEvent.state.key) {
      let key = event.originalEvent.state.key
      event.preventDefault()
      routeTo(`/page/${key}`)
      return false
    }
  })

  $('#navbar-brand').click(goHome)
  $('#navbar-home').click(goHome)
  $('#navbar-login').click(startLogin)
  $('#navbar-logout').click(logout)
  resetNavbar()
  $('#navbar-search').autoComplete({
    resolver: 'custom',
    events: {
      search: function (qry, callback) {
        ajax({
          method: 'GET',
          url: `${root}search/title`,
          data: {'q': qry},
          success: function(results) {
            let searchFormat = results.pages.map((page) => page.title)
            callback(searchFormat)
          },
          error: function(xhr, status, text) {
            showError(`Error searching for ${qry}: ${text}`)
          }
        })
      }
    }
  });

  $('#navbar-search').on('autocomplete.select', function (evt, item) {
    event.preventDefault()
    routeTo(`/page/${item}`)
    return false
  });

  $('#navbar-search').on('autocomplete.freevalue', function (evt, value) {
    event.preventDefault()
    routeTo(`/search`, new URLSearchParams(`?q=${value}`))
    return false
  });

  $('#navbar-search-form').submit(function(event) {
    event.preventDefault()
    let value = $('#navbar-search').text()
    routeTo(`/search`, new URLSearchParams(`?q=${value}`))
    return false
  })

  let path = getPath()
  let query = getQuery()
  routeTo(path, query)
})
