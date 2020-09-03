const root = 'https://api.wikimedia.org/core/v1/wikipedia/en/'
const server = 'https://apiclient.wiki/'

const routes = [
  [new RegExp('^/$'), function(match) { fetchPage('Main Page')}],
  [new RegExp('^/index$'), function(match) { fetchPage('Main Page')}],
  [new RegExp('^/index.html$'), function(match) { fetchPage('Main Page')}],
  [new RegExp('^/page/(.*)$'), function(match) { fetchPage(match[1]) }]
]

const fetchPage = function(pageTitle) {
  $.get({
    url: `${root}page/${pageTitle}/bare`,
    success: function(page) {
      $('#page-title').text(page.title)
      $('#page-content').attr("src", page.html_url)
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

$(document).ready(function() {
  $(window).on('popstate', function(event) {
    if (event && event.originalEvent && event.originalEvent.state && event.originalEvent.state.key) {
      event.preventDefault()
      fetchPage(event.originalEvent.state.key)
      return false
    }
  })
  $('.navbar-brand').click(goHome)
  $('.navbar-home').click(goHome)
  routeTo(document.location.pathname)
})