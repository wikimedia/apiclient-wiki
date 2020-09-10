// PKCE code Copyright (c) 2019 Aaron Parecki
// MIT Public License
// https://github.com/aaronpk/pkce-vanilla-js

const root = 'https://api.wikimedia.org/core/v1/wikipedia/en/'
const authorize = 'https://meta.wikimedia.org/w/rest.php/oauth2/authorize'
const token = 'https://meta.wikimedia.org/w/rest.php/oauth2/access_token'
const server = 'https://apiclient.wiki/'

const clientID = "6ac53a07b581e30e47664cd9e8f3d0e4"

const routes = [
  [new RegExp('^/$'), function(match) { fetchPage('Main Page')}],
  [new RegExp('^/index$'), function(match) { fetchPage('Main Page')}],
  [new RegExp('^/index.html$'), function(match) { fetchPage('Main Page')}],
  [new RegExp('^/page/(.*)$'), function(match) { fetchPage(match[1]) }],
  [new RegExp('^/callback$'), function(match) { endLogin() }],
]

const fetchPage = function(pageTitle) {
  $.get({
    url: `${root}page/${pageTitle}/with_html`,
    success: function(page) {
      $('#page-title').text(page.title)
      let elements = $.parseHTML(page.html)
      let sections = elements.filter((el) => el.tagName == "SECTION")
      let content = sections.map((el) => el.outerHTML).join("")
      $('#page-content').html(content)
      history.pushState({title: page.title, id: page.id, key: page.key}, page.key, `${server}page/${page.key}`)
      $('a[rel="mw:WikiLink"]').click(function(event) {
        event.preventDefault()
        let title = $(this).attr('title')
        fetchPage(title)
        return false
      })
    }})
}

const noSuchRoute = function(pathname) {
  $('#page-title').text("<No such page>")
  $('#page-content').text(`No such page ${pathname}`)
}

const routeTo = function(pathname) {
  for (let route of routes) {
    let [re, handler] = route
    let m = pathname.match(re)
    if (m) {
      handler(m)
      return
    }
  }
  noSuchRoute(pathname)
}

const goHome = function() {
  routeTo('/')
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
  $.post({
    url: token,
    dataType: "json",
    data: data,
    success: function(results) {
      clearPKCE()
      saveLoginResults(results)
      resetNavbar()
      routeTo(state)
    }
  })
}

const saveLoginResults = function(results) {
  // TODO: save other important data
  localStorage.setItem('access_token', results.access_token)
  localStorage.setItem('refresh_token', results.refresh_token)
  localStorage.setItem('access_token_expired_ms', Date.now() + results.expires_in  * 1000)
}

const clearLoginResults = function() {
  // TODO: save other important data
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('access_token_expired_ms')
}

const isLoggedIn = function() {
  return getAccessToken()
}

const getAccessToken = function() {
  return localStorage.getItem('access_token')
}

const resetNavbar = function() {
  if (isLoggedIn()) {
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

const clearPKCE = function(pkce) {
  localStorage.removeItem("pkce_state")
  localStorage.removeItem("pkce_code_verifier")
}

const generateRandomString = function() {
  var array = new Uint32Array(28)
  window.crypto.getRandomValues(array)
  return Array.from(array, dec => ('0' + dec.toString(16)).substr(-2)).join('')
}

// Base64-urlencodes the input string
function base64urlencode(str) {
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

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
  resetNavbar()
}

$(document).ready(function() {
  $(window).on('popstate', function(event) {
    if (event && event.originalEvent && event.originalEvent.state && event.originalEvent.state.key) {
      event.preventDefault()
      fetchPage(event.originalEvent.state.key)
      return false
    }
  })

  $('#navbar-brand').click(goHome)
  $('#navbar-home').click(goHome)
  $('#navbar-login').click(startLogin)
  $('#navbar-login').click(logout)
  resetNavbar()
  $('#navbar-search').autoComplete({
    resolver: 'custom',
    events: {
      search: function (qry, callback) {
        // let's do a custom ajax call
        $.get(
          `${root}search/title`,
          {'q': qry},
          function(results) {
            let searchFormat = results.pages.map((page) => page.title)
            callback(searchFormat)
          }
        )
      }
    }
  });

  let path = getPath()
  routeTo(path)
})
