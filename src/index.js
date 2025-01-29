export default async ({ schedule }, { services, database, getSchema, env, logger }) => {
  const { ItemsService } = services
  const schema = await getSchema()
  const headers = new Headers()
  const apiUrl = `${env.SHISHI_CATALOG_URL}/api/v1/resellers`
  const apiUser = env.SHISHI_CATALOG_API_USER
  const apiPassword = env.SHISHI_CATALOG_API_PASSWORD

  headers.set('Authorization', 'Basic ' + btoa(apiUser + ':' + apiPassword))
  headers.set('Content-Type', 'application/json')

  const clientsService = new ItemsService('resellers', { schema, database })

  const response = await fetch(apiUrl, { headers: headers, method: 'GET' })
  const resellers = await response.json()

  // https://crontab.guru/
  // 0 0,3,6,9,12,15,18,21 * * 1-7
  // 5 4 * * SUN'
  schedule('30 0,3,6,9,12,15,18,21 * * 1-7', async () => {
    for (const reseller of resellers) {
      try {
        const existingClient = await clientsService.readByQuery({
          filter: { buum_uid: { _eq: reseller.buum_uid } },
          limit: 1
        })
        const jsonData = JSON.parse(reseller)
        const { slug, ...rest } = jsonData

        if (existingClient.length > 0) {
          rest.date_updated = new Date().toISOString()
          logger.info(`Updating client: ${slug}`)
          await clientsService.updateOne(slug, rest)
        } else {
          logger.info(`Creating client: ${slug}`)
          await clientsService.createOne({ slug, ...rest })
        }
      } catch (e) {
        logger.error(`Error processing reseller: ${reseller}`)
        logger.error(e)
      }
    }
  })

  schedule('0 0,3,6,9,12,15,18,21 * * 1-7', async () => {
    const resellersFromDB = await clientsService.readByQuery(
      {
        limit: -1,
        filter: { status: 'published' }
      }
    )
    for (const reseller of resellersFromDB) {
      try {
        const response = await fetch(`${apiUrl}/${reseller.buum_uid}`, { headers: headers, method: 'GET' })
        const apiData = await response.json()
        if (!apiData) {
          console.warn(`Archiving: ${reseller.slug}`)
          reseller.status = 'archived'
          reseller.date_updated = new Date().toISOString()
          await clientsService.updateOne(reseller.slug, reseller)
        }
      // else{
      //   const { slug, ...rest } = apiData[0]
      //   rest.date_updated = new Date().toISOString()
      //   await clientsService.updateOne(slug)
      // }
      } catch (e) {
        logger.error(`Error processing reseller: ${reseller}`)
        logger.error(e)
      }
    }
  })
}
