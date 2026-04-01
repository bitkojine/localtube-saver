function extractVideoId(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch (error) {
    return null;
  }

  if (url.hostname === 'www.youtube.com' && url.pathname === '/watch') {
    const id = url.searchParams.get('v');
    if (isValidId(id) && url.searchParams.toString() === `v=${id}`) {
      return id;
    }
    return null;
  }

  if (url.hostname === 'youtu.be') {
    const id = url.pathname.replace('/', '');
    if (isValidId(id) && url.searchParams.toString() === '') {
      return id;
    }
    return null;
  }

  return null;
}

function isValidId(id) {
  return typeof id === 'string' && id.length === 11;
}

module.exports = {
  extractVideoId
};
