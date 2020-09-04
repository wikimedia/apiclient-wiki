// PKCE code Copyright (c) 2019 Aaron Parecki
// https://github.com/aaronpk/pkce-vanilla-js

const root = 'https://api.wikimedia.org/core/v1/wikipedia/en/'
const authorize = 'https://meta.wikimedia.org/w/rest.php/oauth2/authorize'
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

const generateRandomString = function() {
  var array = new Uint32Array(28)
  window.crypto.getRandomValues(array)
  return Array.from(array, dec => ('0' + dec.toString(16)).substr(-2)).join('')
}

// Base64-urlencodes the input string
function base64urlencode(str) {
    // Convert the ArrayBuffer to string using Uint8 array to conver to what btoa accepts.
    // btoa accepts chars only within ascii 0-255 and base64 encodes them.
    // Then convert the base64 encoded to base64url encoded
    //   (replace + with -, replace / with _, trim trailing =)
    let based = btoa(str)
    let urled = based.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    return urled
}

function pkceChallengeFromVerifier(v) {
    let hashed = sha256(v)
    let challenge = base64urlencode(hashed)
    return challenge
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
  let path = getPath()
  routeTo(path)
})
