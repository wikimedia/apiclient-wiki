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

$(document).ready(function() {
  $(window).on('popstate', function(event) {
    if (event && event.originalEvent && event.originalEvent.state && event.originalEvent.state.key) {
      event.preventDefault()
      fetchPage(event.originalEvent.state.key)
      return false
    }
  })
  routeTo(document.location.pathname)
})